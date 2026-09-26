import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../config/env';
import { googleService, AUTH_COOKIE } from '../services/auth';
import * as oauthRelay from '../services/oauthRelay';

const router = Router();
const COOKIE_MAX_AGE = 7 * 24 * 3600 * 1000;

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const wrap = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next);
};

function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: COOKIE_MAX_AGE });
}

router.get(
  '/google',
  wrap(async (req, res) => {
    if (!googleService.isConfigured()) {
      return res.status(503).json({ error: 'Google OAuth is not configured (GOOGLE_CLIENT_ID/SECRET missing)' });
    }
    const redirect = typeof req.query.redirect === 'string' ? req.query.redirect : '/dashboard';
    const state = await googleService.createOAuthState(redirect);
    return res.redirect(await googleService.buildGoogleAuthUrl(state));
  }),
);

router.get(
  '/google/callback',
  wrap(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) return res.status(400).send('Missing OAuth code or state');

    // Google only ever redirects to the anchor's registered callback URI. If the
    // login was initiated on the peer host, forward the code+state verbatim so
    // the peer can complete the exchange and set its own cookie.
    const meta = await googleService.peekOAuthState(state);
    if (meta?.relay && (await oauthRelay.isAnchor())) {
      return res.redirect(`${await oauthRelay.peerCallback('/api/auth/google/callback')}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
    }

    const redirect = (await googleService.consumeOAuthState(state)) ?? '/dashboard';
    const profile = await googleService.exchangeGoogleCode(code);
    const user = await googleService.upsertGoogleUser(profile);
    const token = googleService.signJwt({ id: user.id, email: user.email, name: user.name, avatar: user.avatar });

    setAuthCookie(res, token);
    return res.redirect(`${env.FRONTEND_URL}${redirect}`);
  }),
);

router.get('/config', (_req, res) => {
  res.json({
    googleConfigured: googleService.isConfigured(),
    demoLogin: googleService.demoLoginEnabled,
  });
});

router.get('/me', (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  const user = token ? googleService.verifyJwt(token) : null;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  return res.json({ user });
});

router.post(
  '/demo',
  wrap(async (_req, res) => {
    if (!googleService.demoLoginEnabled) {
      return res.status(404).json({ error: 'Demo login is disabled (set ENABLE_DEMO_LOGIN=true)' });
    }
    const user = await googleService.demoLogin();
    const token = googleService.signJwt({ id: user.id, email: user.email, name: user.name, avatar: user.avatar });
    setAuthCookie(res, token);
    return res.json({ user });
  }),
);

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  return res.json({ ok: true });
});

export default router;