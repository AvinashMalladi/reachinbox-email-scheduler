import { app } from './app';
import { env } from './config/env';
import { knex } from './db/knex';
import { redis, redisPubSub } from './lib/redis';
import { ensureEtherealSenders } from './services/senders';
import { initSearch } from './services/search';
import { recoverPendingJobs } from './services/recovery';
import { startWorker } from './queue/worker';

async function bootstrap() {
  console.log('[boot] verifying database connection...');
  await knex.raw('select 1');
  console.log('[boot] database ok');

  console.log('[boot] verifying redis connection...');
  await redis.ping();
  console.log('[boot] redis ok');

  console.log('[boot] provisioning ethereal senders...');
  try {
    const senders = await ensureEtherealSenders();
    console.log(`[boot] ${senders.length} sender(s) ready (${senders.map((s) => s.email).join(', ')})`);
  } catch (err) {
    console.warn('[boot] sender provisioning failed — scheduling will report a clear error:', (err as Error).message);
  }

  await initSearch();

  console.log('[boot] reconciling pending jobs (restart-safe)...');
  await recoverPendingJobs();

  startWorker();
  console.log(`[boot] worker started (concurrency=${env.WORKER_CONCURRENCY}, min-delay=${env.MIN_DELAY_BETWEEN_SENDS_MS}ms)`);

  app.listen(env.PORT, () => {
    console.log(`[boot] API listening on http://localhost:${env.PORT}`);
    console.log(`[boot] BullMQ dashboard on http://localhost:${env.PORT}/admin/queues`);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  console.log('\n[shutdown] closing connections...');
  redisPubSub.disconnect();
  redis.disconnect();
  knex.destroy().finally(() => process.exit(0));
}

bootstrap().catch(async (err) => {
  console.error('[boot] failed:', err);
  redis.disconnect();
  await knex.destroy();
  process.exit(1);
});