import { knex } from '../db/knex';
import { emailQueue } from '../queue/emailQueue';
import type { EmailJobRow } from '../types/db';

/**
 * Crash-safe bootstrap.
 *
 * BullMQ persists delayed jobs in Redis, so a normal restart needs nothing.
 * This is a belt-and-braces reconciliation pass against the relational DB
 * (source of truth), which also covers Redis data loss:
 *
 *  1. Rows stuck in `sending` (process died mid-send > 2 min ago) are reset to
 *     `scheduled` so they can be retried.
 *  2. Every `scheduled` row is re-added to the queue with a stable `jobId`
 *     (`email-<id>`). BullMQ silently ignores duplicate job ids, and the worker
 *     re-checks the DB status before sending, so nothing is ever sent twice.
 */
export async function recoverPendingJobs(): Promise<{ added: number; pending: number }> {
  const crashed = await knex('email_jobs')
    .where({ status: 'sending' })
    .andWhereRaw(`updated_at < now() - interval '2 minutes'`);

  for (const job of crashed) {
    await knex('email_jobs').where({ id: job.id }).update({ status: 'scheduled', updated_at: knex.fn.now() });
  }

  const pending = await knex('email_jobs')
    .where({ status: 'scheduled' })
    .orderBy('scheduled_at', 'asc');

  for (const email of pending) {
    const delay = Math.max(0, new Date(email.scheduled_at).getTime() - Date.now());
    try {
      await emailQueue.add('send-email', { emailId: email.id }, { jobId: `email-${email.id}`, delay });
    } catch (err) {
      console.warn(`[recovery] could not enqueue ${email.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[recovery] reconciled ${pending.length} scheduled email(s)`);
  return { added: pending.length, pending: pending.length };
}

export type EmailRecoverRow = EmailJobRow;