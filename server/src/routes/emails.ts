import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { knex } from '../db/knex';
import { requireAuth } from '../middleware/auth';
import { scheduleEmails } from '../services/scheduler';
import { emailQueue } from '../queue/emailQueue';
import { searchEmails } from '../services/search';
import type { EmailJobRow } from '../types/db';

const router = Router();
router.use(requireAuth);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const scheduleSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1).max(5000),
  scheduledAt: z.string().datetime({ offset: true }),
  delayBetweenMs: z.number().int().min(0).max(3600000).default(2000),
  hourlyLimit: z.number().int().min(1).max(10000).nullable().optional(),
});

const listSchema = z.object({
  status: z.enum(['scheduled', 'sending', 'sent', 'failed', 'cancelled']).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function toApiEmail(row: EmailJobRow & { sender_email?: string | null }) {
  return {
    id: row.id,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    senderEmail: row.sender_email ?? null,
    previewUrl: row.preview_url,
    lastError: row.last_error,
    batchId: row.batch_id,
    createdAt: row.created_at,
  };
}

router.get(
  '/',
  wrap(async (req, res) => {
    const { status, q, limit, offset } = listSchema.parse(req.query);
    const search = q?.trim();

    const countQuery = knex('email_jobs').count<{ count: string }>({ count: 'id' }).where('user_id', req.user!.id);
    const listQuery = knex('email_jobs')
      .select('email_jobs.*', 'senders.email as sender_email')
      .leftJoin('senders', 'senders.id', 'email_jobs.sender_id')
      .where('email_jobs.user_id', req.user!.id);

    if (status) {
      countQuery.andWhere('status', status);
      listQuery.andWhere('email_jobs.status', status);
    }
    if (search) {
      countQuery.andWhere((b) => b.where('recipient', 'ilike', `%${search}%`).orWhere('subject', 'ilike', `%${search}%`));
      listQuery.andWhere((b) =>
        b.where('email_jobs.recipient', 'ilike', `%${search}%`).orWhere('email_jobs.subject', 'ilike', `%${search}%`),
      );
    }

    const total = await countQuery.first();

    const rows = (await listQuery
      .orderBy('email_jobs.scheduled_at', 'desc')
      .limit(limit)
      .offset(offset)) as Array<EmailJobRow & { sender_email: string | null }>;

    res.json({ items: rows.map(toApiEmail), total: Number(total?.count ?? 0), limit, offset });
  }),
);

router.post(
  '/schedule',
  wrap(async (req, res) => {
    const input = scheduleSchema.parse(req.body);
    const scheduledAt = new Date(input.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) throw new Error('Invalid scheduledAt');

    // De-duplicate + validate recipients
    const recipients = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))].filter((r) =>
      EMAIL_REGEX.test(r),
    );
    if (!recipients.length) throw new Error('No valid recipients after dedup');

    const { batchId, count } = await scheduleEmails({
      userId: req.user!.id,
      subject: input.subject,
      body: input.body,
      recipients,
      scheduledAt,
      delayBetweenMs: input.delayBetweenMs,
      hourlyLimit: input.hourlyLimit ?? null,
    });

    res.status(201).json({ batchId, count, scheduledAt, delayBetweenMs: input.delayBetweenMs });
  }),
);

router.get(
  '/search',
  wrap(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const results = await searchEmails(req.user!.id, q);
    res.json({ items: results, source: results.length ? 'search' : 'query' });
  }),
);

// GET /api/emails/stats → per-status counts + sender count for the current user,
// powering the Operations Center stat cards on the dashboard.
router.get(
  '/stats',
  wrap(async (req, res) => {
    const rows = (await knex('email_jobs')
      .select('status')
      .where({ user_id: req.user!.id })
      .groupBy('status')
      .count<Array<{ status: string; count: string }>>('* as count')) as Array<{ status: string; count: string | number }>;

    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = Number(row.count);

    const senders = await knex('senders').where({ user_id: req.user!.id }).count<Array<{ count: string }>>('* as count');
    const senderCount = Number(senders[0].count);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sentToday = await knex('email_jobs')
      .where({ user_id: req.user!.id, status: 'sent' })
      .andWhere('sent_at', '>=', todayStart.toISOString())
      .count<Array<{ count: string }>>('* as count');

    res.json({
      scheduled: byStatus.scheduled ?? 0,
      sending: byStatus.sending ?? 0,
      sent: byStatus.sent ?? 0,
      failed: byStatus.failed ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      senders: senderCount,
      sentToday: Number(sentToday[0].count),
    });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const row = (await knex('email_jobs')
      .select('email_jobs.*', 'senders.email as sender_email')
      .leftJoin('senders', 'senders.id', 'email_jobs.sender_id')
      .where({ 'email_jobs.id': req.params.id, 'email_jobs.user_id': req.user!.id })
      .first()) as (EmailJobRow & { sender_email: string | null }) | undefined;
    if (!row) return res.status(404).json({ error: 'Email not found' });
    res.json(toApiEmail(row));
  }),
);

router.post(
  '/:id/retry',
  wrap(async (req, res) => {
    const email = (await knex('email_jobs').where({ id: req.params.id, user_id: req.user!.id }).first()) as
      | EmailJobRow
      | undefined;
    if (!email) return res.status(404).json({ error: 'Email not found' });
    if (email.status !== 'failed' && email.status !== 'cancelled') {
      return res.status(400).json({ error: 'Only failed or cancelled emails can be retried' });
    }

    await knex('email_jobs').where({ id: email.id }).update({ status: 'scheduled', last_error: null, updated_at: knex.fn.now() });
    await emailQueue.add('send-email', { emailId: email.id }, { jobId: `email-${email.id}`, delay: 0 });

    res.json({ ok: true, id: email.id });
  }),
);

router.post(
  '/:id/cancel',
  wrap(async (req, res) => {
    const email = (await knex('email_jobs').where({ id: req.params.id, user_id: req.user!.id }).first()) as
      | EmailJobRow
      | undefined;
    if (!email) return res.status(404).json({ error: 'Email not found' });
    if (email.status !== 'scheduled') return res.status(400).json({ error: 'Only scheduled emails can be cancelled' });

    await knex('email_jobs').where({ id: email.id }).update({ status: 'cancelled', updated_at: knex.fn.now() });
    try {
      const job = await emailQueue.getJob(`email-${email.id}`);
      await job?.remove();
    } catch {
      /* job may already be in-flight; DB status guard prevents a send */
    }

    res.json({ ok: true, id: email.id });
  }),
);

export default router;