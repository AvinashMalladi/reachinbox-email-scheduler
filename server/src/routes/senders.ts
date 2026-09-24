import { Router, type Request, type Response, type NextFunction } from 'express';
import { knex } from '../db/knex';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

router.get(
  '/',
  wrap(async (_req, res) => {
    const senders = await knex('senders').select('id', 'email', 'name', 'is_ethereal').orderBy('created_at', 'asc');
    res.json({ items: senders });
  }),
);

export default router;