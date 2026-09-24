import { randomUUID } from 'crypto';
import { knex } from '../db/knex';
import { emailQueue } from '../queue/emailQueue';
import { ensureEtherealSenders, pickSender } from './senders';
import { indexEmail } from './search';

export type ScheduleEmailInput = {
  userId: string;
  subject: string;
  body: string;
  recipients: string[];
  scheduledAt: Date;
  delayBetweenMs: number;
  hourlyLimit?: number | null;
};

/**
 * Bulk-create scheduled emails, assign senders (round-robin, Redis-backed),
 * persist to Postgres, push a delayed job per email into BullMQ, and index the
 * batch into Elasticsearch.
 *
 * Round-robin assignment happens at scheduling time so the per-sender hourly
 * counter can later be attributed deterministically to each email.
 */
export async function scheduleEmails(input: ScheduleEmailInput): Promise<{ batchId: string; count: number; ids: string[] }> {
  if (!input.recipients.length) throw new Error('No recipients provided');
  if (input.recipients.length > 5000) throw new Error('Batch too large (max 5000 per request)');

  const senders = await ensureEtherealSenders();
  const batchId = randomUUID();
  const baseDelay = Math.max(0, input.scheduledAt.getTime() - Date.now());
  const ids: string[] = [];

  for (let i = 0; i < input.recipients.length; i++) {
    // Rotate across senders deterministically by batch index.
    const sender = senders[i % senders.length] ?? (await pickSender());

    const emailId = randomUUID();
    const row = {
      id: emailId,
      user_id: input.userId,
      sender_id: sender.id,
      batch_id: batchId,
      recipient: input.recipients[i].trim().toLowerCase(),
      subject: input.subject,
      body: input.body,
      scheduled_at: input.scheduledAt,
      delay_between_ms: input.delayBetweenMs,
      hourly_limit: input.hourlyLimit ?? null,
      status: 'scheduled' as const,
    };

    await knex('email_jobs').insert(row);
    ids.push(emailId);

    // Delayed BullMQ job — persisted in Redis; survives restarts.
    await emailQueue.add('send-email', { emailId }, {
      jobId: `email-${emailId}`,
      delay: baseDelay + i * input.delayBetweenMs,
    });

    // Index for search (indexEmail degrades to a no-op if ES is unavailable).
    await indexEmail({
      id: emailId,
      userId: input.userId,
      recipient: row.recipient,
      subject: input.subject,
      body: input.body,
      status: 'scheduled',
      scheduledAt: input.scheduledAt.getTime(),
      batchId,
    });
  }

  return { batchId, count: ids.length, ids };
}