import Redis from 'ioredis';
import { env } from '../config/env';

function buildRedis(): Redis {
  if (env.REDIS_URL) {
    // REDIS_URL (e.g. Upstash: rediss://default:pass@host:6379) — used on hosted deploys
    return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    username: env.REDIS_USER || undefined,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
}

export const redis = buildRedis();
export const redisPubSub = buildRedis();

redis.on('error', (err) => {
  console.error('[redis] error:', err.message);
});