import express from 'express';
import path from 'node:path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { emailQueue } from './queue/emailQueue';
import { requireAuth } from './middleware/auth';
import authRouter from './routes/auth';
import emailsRouter from './routes/emails';
import sendersRouter from './routes/senders';
import slackRouter from './routes/slack';
import systemRouter from './routes/system';

export const app = express();

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Health
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ── Live BullMQ dashboard (protected by the same auth cookie) ──
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
app.use('/admin/queues', requireAuth, serverAdapter.getRouter());

// ── API routes ──
app.use('/api/auth', authRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/senders', sendersRouter);
app.use('/api/slack', slackRouter);
app.use('/api/system', systemRouter);

// ── Production: serve the built React SPA from the same origin ──
if (env.NODE_ENV === 'production') {
  const staticDir = path.join(__dirname, '../../web/dist');
  app.use(express.static(staticDir, { index: false }));
  app.get(/^\/(?!api|admin).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
}

// 404 + error handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.name === 'ZodError' ? 400 : 500;
  console.error(`[error] ${status}:`, err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  res.status(status).json({
    error: err.name === 'ZodError' ? 'Invalid request' : 'Internal server error',
    detail: err instanceof Error ? err.message : undefined,
  });
});