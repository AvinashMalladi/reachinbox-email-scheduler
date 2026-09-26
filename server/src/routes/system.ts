import { Router, type Request, type Response, type NextFunction } from 'express';
import { knex } from '../db/knex';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { emailQueue } from '../queue/emailQueue';
import { getMailerStatus } from '../services/emailSender';
import { searchHealth } from '../services/search';
import { getSlackConnection } from '../services/slack';

const router = Router();
router.use(requireAuth);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

// GET /api/system/status → live view of the delivery pipeline for the
// dashboard's Operations Center: BullMQ queue counts, mailer mode, search
// backend and Slack connectivity.
router.get(
  '/status',
  wrap(async (req, res) => {
    const [queueCounts, mailer, search, slack] = await Promise.all([
      emailQueue.getJobCounts().catch(() => null),
      Promise.resolve(getMailerStatus()),
      Promise.resolve(searchHealth()),
      getSlackConnection(req.user!.id).catch(() => null),
    ]);

    const senders = await knex('senders').where({ user_id: req.user!.id }).count({ count: '*' });
    const senderCount = Number(senders[0]?.count ?? 0);

    res.json({
      queues: queueCounts
        ? {
            waiting: queueCounts.waiting ?? 0,
            active: queueCounts.active ?? 0,
            delayed: queueCounts.delayed ?? 0,
            completed: queueCounts.completed ?? 0,
            failed: queueCounts.failed ?? 0,
            paused: queueCounts.paused ?? 0,
          }
        : null,
      mailer,
      elasticsearch: search,
      slack: {
        configured: Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET),
        connected: Boolean(slack),
      },
      senders: senderCount,
      adminUrl: '/admin/queues',
    });
  }),
);

export default router;