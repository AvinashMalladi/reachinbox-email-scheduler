import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { knex } from '../db/knex';
import { redis } from '../lib/redis';
import { env } from '../config/env';
import type { UserRow } from '../types/db';

export const AUTH_COOKIE = 'ri_token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export type AuthUser = Pick<UserRow, 'id' | 'email' | 'name' | 'avatar'>;

export type GoogleProfile = {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
};

export const googleService = {
  demoLoginEnabled: env.ENABLE_DEMO_LOGIN,

  isConfigured(): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  },

  async createOAuthState(redirect: string): Promise<string> {
    const state = randomBytes(24).toString('hex');
    await redis.set(`oauth:state:${state}`, redirect, 'EX', 600);
    return state;
  },

  async consumeOAuthState(state: string): Promise<string | null> {
    const redirect = await redis.get(`oauth:state:${state}`);
    if (redirect) await redis.del(`oauth:state:${state}`);
    return redirect;
  },

  buildGoogleAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  },

  async exchangeGoogleCode(code: string): Promise<GoogleProfile> {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenBody.access_token) {
      throw new Error(`Google token exchange failed: ${tokenBody.error ?? tokenRes.status}`);
    }

    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    const profile = (await profileRes.json()) as GoogleProfile;
    if (!profile.email) throw new Error('Google profile missing email');
    return profile;
  },

  async upsertGoogleUser(profile: GoogleProfile): Promise<UserRow> {
    const existing = await knex('users').where({ google_id: profile.id }).first<UserRow>();
    if (existing) {
      await knex('users').where({ id: existing.id }).update({
        email: profile.email,
        name: profile.name ?? existing.name,
        avatar: profile.picture ?? existing.avatar,
        google_profile: { ...(existing.google_profile ?? {}), ...profile },
        updated_at: knex.fn.now(),
      });
      return (await knex('users').where({ id: existing.id }).first<UserRow>())!;
    }

    const [created] = await knex('users')
      .insert({
        google_id: profile.id,
        email: profile.email,
        name: profile.name ?? null,
        avatar: profile.picture ?? null,
        google_profile: profile,
      })
      .returning<UserRow[]>('*');

    if (created) return created;

    const byGoogle = await knex('users').where({ google_id: profile.id }).first<UserRow>();
    if (byGoogle) return byGoogle;
    const byEmail = await knex('users').where({ email: profile.email }).first<UserRow>();
    if (byEmail) {
      await knex('users').where({ id: byEmail.id }).update({ google_id: profile.id });
      return (await knex('users').where({ id: byEmail.id }).first<UserRow>())!;
    }
    throw new Error('Could not create user');
  },

  async demoLogin(): Promise<UserRow> {
    const existing = await knex('users').where({ email: 'demo@reachinbox.local' }).first<UserRow>();
    if (existing) return existing;
    const [created] = await knex('users')
      .insert({
        email: 'demo@reachinbox.local',
        name: 'Demo User',
        avatar: null,
        google_profile: { provider: 'demo' },
      })
      .returning<UserRow[]>('*');
    return created ?? (await knex('users').where({ email: 'demo@reachinbox.local' }).first<UserRow>())!;
  },

  signJwt(user: { id: string; email: string; name: string | null; avatar: string | null }): string {
    return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  },

  verifyJwt(token: string): AuthUser | null {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & { email?: string };
      if (!payload.sub) return null;
      return { id: payload.sub, email: payload.email ?? '', name: null, avatar: null };
    } catch {
      return null;
    }
  },
};