import { Worker, type Job } from 'bullmq';
import { knex } from '../db/knex';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import { EMAIL_QUEUE, emailQueue, type SendEmailJobData } from './emailQueue';
import { getSender } from '../services/senders';
import { sendEmail } from '../services/emailSender';
import { checkRateLimit, claimSlackNotification } from '../services/rateLimiter';
import { notifyRateLimitHit } from '../services/slack';
import { updateSearchIndex } from '../services/search';
import type { EmailJobRow } from '../types/db';

export const processor = async (job: Job<SendEmailJobData>) => {
  const { emailId } = job.data;

  // DB is the source of truth — guard against re-sends (idempotency).
  const email = await knex('email_jobs').where({ id: emailId }).first<EmailJobRow>();
  if (!email) return { skipped: true, reason: 'not-found' };
  if (email.status !== 'scheduled') return { skipped: true, reason: `already-${email.status}` };

  const sender = await getSender(email.sender_id);
  if (!sender) {
    await knex('email_jobs')
      .where({ id: email.id })
      .update({ status: 'failed', last_error: 'no-sender-configured', updated_at: knex.fn.now() });
    return { failed: true, reason: 'no-sender' };
  }

  // ── 1. Hourly rate limit (Redis-backed counters; safe across instances) ──
  const perSenderLimit = email.hourly_limit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const globalLimit = env.MAX_EMAILS_PER_HOUR_GLOBAL;

  const rate = await checkRateLimit({ senderId: sender.id, perSenderLimit, globalLimit });

  if (!rate.ok) {
    // Do not drop, do not fail — push the job into the next hour window.
    await knex('email_jobs')
      .where({ id: email.id })
      .update({ status: 'scheduled', updated_at: knex.fn.now() });

    try {
      await job.moveToDelayed(rate.nextWindowStart, job.token);
    } catch {
      await emailQueue.add('send-email', { emailId: email.id }, {
        jobId: `email-${email.id}`,
        delay: Math.max(0, rate.nextWindowStart - Date.now()),
      });
    }

    // Live Slack notification — exactly once per sender + hour window.
    if (await claimSlackNotification(sender.id)) {
      await notifyRateLimitHit({ sender, email, limit: perSenderLimit, nextWindowStart: rate.nextWindowStart });
    }

    return { rescheduled: true, nextWindowStart: rate.nextWindowStart };
  }

  // ── 2. Mark processing, then actually send via Ethereal ──
  await knex('email_jobs')
    .where({ id: email.id })
    .update({ status: 'sending', attempts: email.attempts + 1, updated_at: knex.fn.now() });
  await updateSearchIndex(email.id, { status: 'sending' });

  try {
    const result = await sendEmail({
      sender,
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });

    await knex('email_jobs').where({ id: email.id }).update({
      status: 'sent',
      sent_at: new Date(),
      message_id: result.messageId,
      preview_url: result.previewUrl,
      last_error: null,
      updated_at: knex.fn.now(),
    });
    await updateSearchIndex(email.id, { status: 'sent' });

    return { sent: true, messageId: result.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await knex('email_jobs')
      .where({ id: email.id })
      .update({ status: 'failed', last_error: message, updated_at: knex.fn.now() });
    await updateSearchIndex(email.id, { status: 'failed', last_error: message });
    throw new Error(message);
  }
};

let worker: Worker | null = null;

export function startWorker(): Worker {
  if (worker) return worker;

  worker = new Worker<SendEmailJobData>(EMAIL_QUEUE, processor, {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
    // Provider throttling simulation: at most 1 job may *start* every
    // MIN_DELAY_BETWEEN_SENDS_MS across all workers on this queue.
    limiter: { max: 1, duration: env.MIN_DELAY_BETWEEN_SENDS_MS },
  });

  worker.on('completed', (job) => console.log(`[worker] completed ${job.id}`));
  worker.on('failed', (job, err) => console.error(`[worker] failed ${job?.id}: ${err.message}`));
  worker.on('error', (err) => console.error('[worker] error:', err.message));

  return worker;
}

export function stopWorker(): Promise<void> | undefined {
  return worker?.close();
}