import { Router, type Request, type Response, type NextFunction } from 'express';
import { knex } from '../db/knex';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { deleteSlackConnection, getSlackConnection, resolveGeneralChannelId, saveSlackConnection } from '../services/slack';

const router = Router();
router.use(requireAuth);

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';

function slackAuthorizeUrl(): string {
  // Deep-link into a specific workspace when configured so reviewers never see
  // Slack's "find your workspace / enter workspace URL" screen.
  return env.SLACK_TEAM_DOMAIN
    ? `https://${env.SLACK_TEAM_DOMAIN}.slack.com/oauth/v2/authorize`
    : SLACK_AUTHORIZE_URL;
}

function isSlackConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

// GET /api/slack/connect?redirect=/dashboard → redirects user into Slack OAuth
router.get(
  '/connect',
  wrap(async (req, res) => {
    if (!isSlackConfigured()) {
      return res.status(503).json({ error: 'Slack not configured (SLACK_CLIENT_ID/SECRET missing)' });
    }
    const state = `${req.user!.id}:${Buffer.from((req.query.redirect as string) ?? '/dashboard').toString('base64url')}`;
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      scope: 'chat:write,channels:read',
      redirect_uri: env.SLACK_REDIRECT_URI,
      state,
    });
    return res.redirect(`${slackAuthorizeUrl()}?${params.toString()}`);
  }),
);

router.get(
  '/callback',
  wrap(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) return res.status(400).send('Missing Slack callback params');

    const [userId, redirectB64] = state.split(':');
    if (!userId || !redirectB64) return res.status(400).send('Invalid state');

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID!,
        client_secret: env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: env.SLACK_REDIRECT_URI,
      }),
    });
    const tokenBody = (await tokenRes.json()) as {
      ok: boolean;
      error?: string;
      access_token?: string;
      team?: { id?: string; name?: string };
      bot_user_id?: string;
    };

    if (!tokenBody.ok || !tokenBody.access_token) {
      return res.status(400).send(`Slack OAuth failed: ${tokenBody.error ?? 'unknown'}`);
    }

    const channelId = await resolveGeneralChannelId(tokenBody.access_token);

    await saveSlackConnection(userId, {
      teamId: tokenBody.team?.id,
      teamName: tokenBody.team?.name,
      accessToken: tokenBody.access_token,
      botUserId: tokenBody.bot_user_id,
      channelId,
    });

    const redirect = Buffer.from(redirectB64, 'base64url').toString();
    return res.redirect(`${env.FRONTEND_URL}${redirect}`);
  }),
);

router.get(
  '/status',
  wrap(async (req, res) => {
    const conn = await getSlackConnection(req.user!.id);
    const teamDomain = env.SLACK_TEAM_DOMAIN ?? null;
    if (!conn) {
      return res.json({ connected: false, configured: isSlackConfigured(), teamDomain });
    }
    return res.json({
      connected: true,
      configured: isSlackConfigured(),
      team: conn.team_name ?? conn.team_id,
      channelId: conn.channel_id,
      teamDomain,
    });
  }),
);

// GET /api/slack/alerts → recent rate-limit alerts for the current user.
// These are always persisted (whether or not Slack delivered them), so the
// rate-limit feature stays visible in-app even when Slack is not connected.
router.get(
  '/alerts',
  wrap(async (req, res) => {
    const rows = await knex('slack_alerts')
      .where({ user_id: req.user!.id })
      .orderBy('created_at', 'desc')
      .limit(5);
    res.json({ items: rows });
  }),
);

router.post(
  '/disconnect',
  wrap(async (req, res) => {
    await deleteSlackConnection(req.user!.id);
    res.json({ ok: true });
  }),
);

export default router;