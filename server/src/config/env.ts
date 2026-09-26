import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().default('postgres://reachinbox:reachinbox@localhost:5432/reachinbox'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_USER: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().default('dev-secret'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/api/auth/google/callback'),
  ENABLE_DEMO_LOGIN: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/api/slack/callback'),

  ETHEREAL_USER: z.string().optional(),
  ETHEREAL_PASSWORD: z.string().optional(),
  ETHEREAL_SENDERS: z.string().optional(),
  ETHEREAL_SENDERS_COUNT: z.coerce.number().default(3),
  // Alternate Ethereal SMTP port (2525) for hosts whose egress blocks 587/465.
  ETHEREAL_SMTP_PORT: z.coerce.number().default(587),

  // Optional real SMTP relay (hosted deploys where Ethereal is unreachable).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Optional Brevo REST delivery (port 443 — used only as an automatic
  // fallback on hosts whose egress blocks outbound SMTP, e.g. Render free).
  // Ethereal SMTP remains the primary, spec-required mailer.
  BREVO_API_KEY: z.string().optional(),
  // Verified From-address for the Brevo fallback (any address Brevo accepts).
  EMAIL_FALLBACK_FROM: z.string().optional(),

  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().default(2000),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(50),
  MAX_EMAILS_PER_HOUR_GLOBAL: z.coerce.number().default(200),

  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ES_ENABLED: z.string().optional().transform((v) => v !== 'false'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const HOUR_MS = 3_600_000;