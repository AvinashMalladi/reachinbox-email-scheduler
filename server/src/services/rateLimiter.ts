import { redis } from '../lib/redis';
import { HOUR_MS } from '../config/env';

/**
 * Hourly rate limiting backed by Redis counters so it stays correct across
 * multiple workers / instances.
 *
 * Keys:  `rl:global:<hourWindow>`  and  `rl:sender:<senderId>:<hourWindow>`
 *
 * The check-and-reserve is atomic per key (INCR). When a job would exceed a
 * limit we DECR (undo the reservation) and ask the caller to delay the job into
 * the next hour window. Nothing is dropped and no job is permanently failed.
 */

const KEY_TTL_SECONDS = 2 * 3600 + 60; // keep counters around a bit past the window

export type RateCheckResult = { ok: true; count: number } | { ok: false; nextWindowStart: number };

export function currentHourWindow(now = Date.now()): number {
  return Math.floor(now / HOUR_MS);
}

export function nextHourStart(now = Date.now()): number {
  return (Math.floor(now / HOUR_MS) + 1) * HOUR_MS;
}

export async function checkRateLimit(opts: {
  senderId: string;
  perSenderLimit: number;
  globalLimit: number;
  now?: number;
}): Promise<RateCheckResult> {
  const now = opts.now ?? Date.now();
  const window = currentHourWindow(now);

  const senderKey = `rl:sender:${opts.senderId}:${window}`;
  const globalKey = `rl:global:${window}`;

  const [senderCount, globalCount] = await Promise.all([
    redis.incr(senderKey),
    redis.incr(globalKey),
  ]);

  if (senderCount === 1) await redis.expire(senderKey, KEY_TTL_SECONDS);
  if (globalCount === 1) await redis.expire(globalKey, KEY_TTL_SECONDS);

  const perSenderOk = senderCount <= opts.perSenderLimit;
  const globalOk = globalCount <= opts.globalLimit;

  if (perSenderOk && globalOk) {
    return { ok: true, count: senderCount };
  }

  // Roll back the reservation so the counters reflect only accepted jobs.
  await Promise.all([redis.decr(senderKey), redis.decr(globalKey)]);

  return { ok: false, nextWindowStart: nextHourStart(now) };
}

/**
 * Returns true exactly once per (senderId, hourWindow) — used to notify Slack a
 * single time per window instead of spamming for every throttled job.
 */
export async function claimSlackNotification(senderId: string, now = Date.now()): Promise<boolean> {
  const window = currentHourWindow(now);
  const key = `slack:notified:${senderId}:${window}`;
  const res = await redis.set(key, '1', 'EX', KEY_TTL_SECONDS, 'NX');
  return res === 'OK';
}