import nodemailer from 'nodemailer';
import { knex } from '../db/knex';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import type { SenderRow } from '../types/db';

type SenderCredential = { email: string; pass: string };

function parseSenderList(): SenderCredential[] {
  if (!env.ETHEREAL_SENDERS) return [];
  return env.ETHEREAL_SENDERS.split(',')
    .map((entry) => {
      const [email, pass, ...rest] = entry.trim().split(':');
      if (rest.length) {
        // passwords may contain ':' — rejoin
        return { email: email.trim(), pass: [pass, ...rest].join(':') };
      }
      return { email: email?.trim() ?? '', pass: pass?.trim() ?? '' };
    })
    .filter((s) => s.email && s.pass && s.email.includes('@'));
}

async function provisionTestAccounts(count: number): Promise<SenderCredential[]> {
  const seen = new Set<string>();
  const out: SenderCredential[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 3) {
    attempts++;
    const account = await nodemailer.createTestAccount();
    if (seen.has(account.user)) continue; // Ethereal can dedupe rapid calls
    seen.add(account.user);
    out.push({ email: account.user, pass: account.pass });
  }
  return out;
}

/**
 * Ensure sender accounts are persisted in the DB. Resolution order:
 *   1. ETHEREAL_SENDERS (explicit multi sender list, most reliable)
 *   2. ETHEREAL_USER / ETHEREAL_PASSWORD (single account)
 *   3. Auto-provision ETHEREAL_SENDERS_COUNT throwaway accounts via the API
 */
export async function ensureEtherealSenders(count = env.ETHEREAL_SENDERS_COUNT): Promise<SenderRow[]> {
  const existing = await knex('senders').orderBy('created_at', 'asc');

  if (existing.length >= count) {
    return existing;
  }

  const missing = count - existing.length;
  const wanted: SenderCredential[] = parseSenderList();

  if (!wanted.length && env.ETHEREAL_USER && env.ETHEREAL_PASSWORD) {
    wanted.push({ email: env.ETHEREAL_USER, pass: env.ETHEREAL_PASSWORD });
  }

  // Top up with auto-provisioned accounts if the config doesn't cover `count`.
  while (wanted.length < missing) {
    const [account] = await provisionTestAccounts(missing - wanted.length);
    if (!account) break;
    wanted.push(account);
  }

  const base = existing.length + 1;
  const rows = wanted.slice(0, missing).map((cred, i) => ({
    user_id: null,
    email: cred.email,
    name: `Ethereal Sender ${base + i}`,
    host: 'smtp.ethereal.email',
    port: 587,
    username: cred.email,
    password: cred.pass,
    is_ethereal: true,
  }));

  if (rows.length) {
    await knex('senders').insert(rows).onConflict('email').ignore();
  }

  return knex('senders').orderBy('created_at', 'asc');
}

async function redisIncr(key: string): Promise<number> {
  const res = await redis.incr(key);
  if (res === 1) {
    await redis.expire(key, 86400);
  }
  return res;
}

/**
 * Round-robin sender selection. The counter lives in Redis so assignment stays
 * safe across multiple API/worker instances.
 */
export async function pickSender(): Promise<SenderRow> {
  const senders = await knex('senders').orderBy('created_at', 'asc');
  if (!senders.length) {
    throw new Error('No SMTP senders configured. Start the server once to provision Ethereal senders.');
  }
  const idx = await redisIncr('sender:rr-counter');
  return senders[((idx - 1) % senders.length + senders.length) % senders.length];
}

export async function getSender(id: string | null): Promise<SenderRow | null> {
  if (!id) return null;
  return (await knex('senders').where({ id }).first()) ?? null;
}