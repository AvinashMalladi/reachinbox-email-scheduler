import { Client } from '@elastic/elasticsearch';
import type { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { knex } from '../db/knex';
import { env } from '../config/env';

const INDEX = 'reachinbox-emails';

type IndexDoc = {
  id: string;
  userId: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt?: number;
  sentAt?: number | null;
  batchId?: string | null;
  last_error?: string | null;
};

let client: Client | null = null;
let available = false;

const MAPPINGS: MappingTypeMapping = {
  properties: {
    id: { type: 'keyword' },
    userId: { type: 'keyword' },
    recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
    subject: { type: 'text' },
    body: { type: 'text' },
    status: { type: 'keyword' },
    scheduledAt: { type: 'date' },
    sentAt: { type: 'date' },
    batchId: { type: 'keyword' },
    last_error: { type: 'text' },
  },
};

export function searchHealth(): { enabled: boolean; reachable: boolean; index: string } {
  return { enabled: env.ES_ENABLED, reachable: env.ES_ENABLED && available, index: INDEX };
}

export async function initSearch(): Promise<void> {
  if (!env.ES_ENABLED) {
    console.warn('[search] search disabled via ES_ENABLED=false');
    return;
  }
  client = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 1200, pingTimeout: 1000 });
  try {
    await client.ping();
    const res = (await client.indices.exists({ index: INDEX })) as { exists?: boolean } | boolean;
    const exists = typeof res === 'boolean' ? res : !!res?.exists;
    if (!exists) {
      await client.indices.create({ index: INDEX, mappings: MAPPINGS });
    }
    available = true;
    console.log('[search] elasticsearch connected');
  } catch (err) {
    available = false;
    console.warn('[search] Elasticsearch unavailable — falling back to SQL LIKE search:', (err as Error).message);
  }
}

export async function indexEmail(doc: IndexDoc): Promise<void> {
  if (!available || !client) return;
  try {
    await client.index({ index: INDEX, id: doc.id, document: doc });
  } catch (err) {
    console.warn('[search] index failed:', (err as Error).message);
  }
}

export async function updateSearchIndex(emailId: string, patch: Partial<IndexDoc>): Promise<void> {
  if (!available || !client) return;
  try {
    await client.update({ index: INDEX, id: emailId, doc: patch });
  } catch (err) {
    console.warn('[search] update failed:', (err as Error).message);
  }
}

export async function deleteFromSearch(emailId: string): Promise<void> {
  if (!available || !client) return;
  try {
    await client.delete({ index: INDEX, id: emailId });
  } catch {
    /* index may not exist — fine */
  }
}

export type SearchResult = Array<{
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: number | null;
  sentAt: number | null;
}>;

/**
 * Full-text search. Uses Elasticsearch when reachable, otherwise falls back to
 * a Postgres ILIKE query so the feature works even without the ES container.
 */
export async function searchEmails(userId: string, q: string): Promise<SearchResult> {
  const query = q.trim();

  if (query && available && client) {
    try {
      const result = await client.search<IndexDoc>({
        index: INDEX,
        query: {
          bool: {
            filter: [{ term: { userId } }],
            must: [
              {
                multi_match: {
                  query,
                  fields: ['recipient', 'subject', 'body'],
                  type: 'best_fields',
                },
              },
            ],
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
        size: 100,
      });

      return result.hits.hits.map((hit) => ({
        id: hit._source!.id,
        recipient: hit._source!.recipient,
        subject: hit._source!.subject,
        body: hit._source!.body,
        status: hit._source!.status,
        scheduledAt: hit._source!.scheduledAt ?? null,
        sentAt: hit._source!.sentAt ?? null,
      }));
    } catch (err) {
      console.warn('[search] es search failed, falling back to SQL:', (err as Error).message);
    }
  }

  const rows = query
    ? await knex('email_jobs')
        .where({ user_id: userId })
        .andWhere((b) =>
          b
            .where('recipient', 'ilike', `%${query}%`)
            .orWhere('subject', 'ilike', `%${query}%`)
            .orWhere('body', 'ilike', `%${query}%`),
        )
        .orderBy('scheduled_at', 'desc')
        .limit(100)
    : [];

  return rows.map((r) => ({
    id: r.id,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    status: r.status,
    scheduledAt: r.scheduled_at ? new Date(r.scheduled_at).getTime() : null,
    sentAt: r.sent_at ? new Date(r.sent_at).getTime() : null,
  }));
}