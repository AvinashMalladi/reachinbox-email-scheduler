import { env } from '../config/env';
import { redis } from '../lib/redis';

// Cross-deployment OAuth relay. Google OAuth clients and Slack apps only allow
// an EXACT match on redirect_uri, so a single origin ("registered anchor") holds
// the URIs actually registered in the consoles. When a second origin ("peer")
// exists on a different host, that host starts its login through the anchor's
// callback and the anchor transparently forwards the code+state to the peer so
// the peer can complete the exchange and set its own cookie.
//
// The config (registered + peer origins) is read first from env vars and,
// failing that, from shared Redis (so the anchor host needs no extra env). The
// peer publishes it on boot via publishRelayConfig().

const CONFIG_KEY = 'oauth:relay:config';
const CONFIG_TTL_SECONDS = 60 * 60 * 24 * 30;

export type RelayConfig = { registered: string; peer: string };

let cached: RelayConfig | null | undefined; // undefined = not fetched yet
let cacheAt = 0;
const CACHE_TTL_MS = 30_000;

export function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function selfOrigin(): string {
  return originOf(env.FRONTEND_URL) ?? env.FRONTEND_URL;
}

export async function getRelayConfig(): Promise<RelayConfig | null> {
  const envReg = originOf(env.OAUTH_REGISTERED_ORIGIN);
  const envPeer = originOf(env.OAUTH_PEER_ORIGIN);
  if (envReg && envPeer) return { registered: envReg, peer: envPeer };

  const now = Date.now();
  if (cached !== undefined && now - cacheAt < CACHE_TTL_MS) return cached;

  cached = null;
  try {
    const raw = await redis.get(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RelayConfig>;
      const reg = originOf(parsed.registered);
      const peer = originOf(parsed.peer);
      if (reg && peer) cached = { registered: reg, peer };
    }
  } catch {
    cached = null;
  }
  cacheAt = now;
  return cached;
}

export async function isAnchor(): Promise<boolean> {
  const cfg = await getRelayConfig();
  if (!cfg) return false;
  const self = selfOrigin();
  return self === cfg.registered && self !== cfg.peer;
}

export async function isPeer(): Promise<boolean> {
  const cfg = await getRelayConfig();
  if (!cfg) return false;
  const self = selfOrigin();
  return self === cfg.peer && self !== cfg.registered;
}

export async function registeredCallback(path: string): Promise<string> {
  const cfg = await getRelayConfig();
  if (!cfg) throw new Error('OAuth relay config missing (OAUTH_REGISTERED_ORIGIN/OAUTH_PEER_ORIGIN unset)');
  return `${cfg.registered}${path}`;
}

export async function peerCallback(path: string): Promise<string> {
  const cfg = await getRelayConfig();
  if (!cfg) throw new Error('OAuth relay config missing (OAUTH_REGISTERED_ORIGIN/OAUTH_PEER_ORIGIN unset)');
  return `${cfg.peer}${path}`;
}

// Publishing host advertises the pair to the shared Redis so the anchor host (and
// any instance without env vars) learns the topology. Call once at boot.
export async function publishRelayConfig(): Promise<boolean> {
  const envReg = originOf(env.OAUTH_REGISTERED_ORIGIN);
  const envPeer = originOf(env.OAUTH_PEER_ORIGIN);
  if (!envReg || !envPeer) return false;
  const cfg: RelayConfig = { registered: envReg, peer: envPeer };
  await redis.set(CONFIG_KEY, JSON.stringify(cfg), 'EX', CONFIG_TTL_SECONDS);
  cached = cfg;
  cacheAt = Date.now();
  return true;
}