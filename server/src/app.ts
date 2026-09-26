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
// Whitelabeled to match the Operations Center: blue theme, own title/logo,
// Redis connection details hidden and workers list skipped (avoids per-poll
// `CLIENT LIST` round-trips against shared Redis).
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'ReachInbox · Queue Operations',
      boardLogo: {
        path: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSczNCcgaGVpZ2h0PSczNCc+PHJlY3Qgd2lkdGg9JzM0JyBoZWlnaHQ9JzM0JyByeD0nOScgZmlsbD0nIzFkNGVkOCcvPjx0ZXh0IHg9JzE3JyB5PScyMi41JyBmb250LWZhbWlseT0nU2Vnb2UgVUksQXJpYWwsc2Fucy1zZXJpZicgZm9udC1zaXplPScxNScgZm9udC13ZWlnaHQ9JzcwMCcgZmlsbD0nI2ZmZmZmZicgdGV4dC1hbmNob3I9J21pZGRsZSc+Ukk8L3RleHQ+PC9zdmc+',
        height: 28,
        width: 28,
      },
      environment: { label: 'production', color: '#2563eb', textColor: '#ffffff' },
      hideDocsLink: true,
      hideRedisDetails: true,
      showWorkers: false,
      miscLinks: [{ text: 'Operations Center', url: '/dashboard' }],
      theme: {
        light: {
          background: '#f5f8ff',
          foreground: '#0f172a',
          card: '#ffffff',
          'card-foreground': '#1e293b',
          primary: '#2563eb',
          'primary-foreground': '#ffffff',
          'secondary': '#e8f0fe',
          'secondary-foreground': '#1d4ed8',
          muted: '#eef4ff',
          'muted-foreground': '#64748b',
          accent: '#dbeafe',
          'accent-foreground': '#1d4ed8',
          border: '#dbeafe',
          input: '#cbd5e1',
          ring: '#93c5fd',
          radius: '10px',
          overlay: 'rgba(15, 23, 42, 0.5)',
          sidebar: '#1e3a8a',
          'sidebar-foreground': '#dbeafe',
          'sidebar-primary': '#2563eb',
          'sidebar-primary-foreground': '#ffffff',
          'sidebar-accent': '#1d4ed8',
          'sidebar-accent-foreground': '#ffffff',
          'sidebar-state-hover': 'rgba(255, 255, 255, 0.08)',
          'sidebar-state-selected': '#2563eb',
          'sidebar-state-selected-hover': '#3b82f6',
          'sidebar-state-selected-foreground': '#ffffff',
          'sidebar-border': 'rgba(255, 255, 255, 0.12)',
          'sidebar-ring': '#60a5fa',
        },
      },
    },
  },
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