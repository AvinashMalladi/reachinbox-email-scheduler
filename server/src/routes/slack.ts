import { Router, type Request, type Response, type NextFunction } from 'express';
import { knex } from '../db/knex';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import * as oauthRelay from '../services/oauthRelay';
import { deleteSlackConnection, getSlackConnection, resolveGeneralChannelId, saveSlackConnection } from '../services/slack';

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_CALLBACK_PATH = '/api/slack/callback';

// Prefix used to mark states created on the peer host so the anchor can tell it
// should relay the callback instead of processing it as its own login.
const RELAY_STATE_PREFIX = 'rw';

function slackAuthorizeUrl(): string {
  // Deep-link into a specific workspace when configured so reviewers never see
  // Slack's "find your workspace / enter workspace URL" screen.
  return env.SLACK_TEAM_DOMAIN
    ? `https://${env.SLACK_TEAM_DOMAIN}.slack.com/oauth/v2/authorize`
    : SLACK_AUTHORIZE_URL;
}

// On the peer host the redirect_uri sent to Slack must be the anchor's
// registered URI (Slack only matches against registered values).
async function slackCallbackUri(): Promise<string> {
  return (await oauthRelay.isPeer())
    ? await oauthRelay.registeredCallback(SLACK_CALLBACK_PATH)
    : env.SLACK_REDIRECT_URI;
}

function isSlackConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

function parseSlackState(state: string): { userId: string; redirect: string; relayed: boolean } {
  const parts = state.split(':');
  if (parts.length === 3 && parts[0] === RELAY_STATE_PREFIX) {
    return { userId: parts[1], redirect: Buffer.from(parts[2], 'base64url').toString(), relayed: true };
  }
  return { userId: parts[0], redirect: Buffer.from(parts[1], 'base64url').toString(), relayed: false };
}

// Public callback, intentionally registered before requireAuth: the browser
// follows Slack's redirect to this URI, and in the relay case the initiating
// user has no cookies for this origin.
router.get(
  '/callback',
  wrap(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) return res.status(400).send('Missing Slack callback params');

    // Slack only ever redirects to the anchor's registered callback URI. If the
    // connect flow was started on the peer host, forward the code+state
    // verbatim so the peer can complete the exchange.
    const parsed = parseSlackState(state);
    if (parsed.relayed && (await oauthRelay.isAnchor())) {
      return res.redirect(`${await oauthRelay.peerCallback(SLACK_CALLBACK_PATH)}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    }

    const { userId, redirect } = parsed;

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID!,
        client_secret: env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: await slackCallbackUri(),
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

    return res.redirect(`${env.FRONTEND_URL}${redirect}`);
  }),
);

router.use(requireAuth);

// GET /api/slack/connect?redirect=/dashboard → redirects user into Slack OAuth
router.get(
  '/connect',
  wrap(async (req, res) => {
    if (!isSlackConfigured()) {
      return res.status(503).json({ error: 'Slack not configured (SLACK_CLIENT_ID/SECRET missing)' });
    }
    const state = `${(await oauthRelay.isPeer()) ? `${RELAY_STATE_PREFIX}:` : ''}${req.user!.id}:${Buffer.from((req.query.redirect as string) ?? '/dashboard').toString('base64url')}`;
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      scope: 'chat:write,channels:read',
      redirect_uri: await slackCallbackUri(),
      state,
    });
    return res.redirect(`${slackAuthorizeUrl()}?${params.toString()}`);
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