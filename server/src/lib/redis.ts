import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  username: env.REDIS_USER || undefined,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  console.error('[redis] error:', err.message);
});

export const redisPubSub = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  username: env.REDIS_USER || undefined,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});