import type { RequestHandler } from 'express';
import { AUTH_COOKIE } from '../services/auth';
import { googleService } from '../services/auth';

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  const user = token ? googleService.verifyJwt(token) : null;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.user = { id: user.id, email: user.email };
  next();
};