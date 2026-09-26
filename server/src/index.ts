import { app } from './app';
import { env } from './config/env';
import { knex } from './db/knex';
import { redis, redisPubSub } from './lib/redis';
import { ensureEtherealSenders } from './services/senders';
import { probeEthereal } from './services/emailSender';
import { initSearch } from './services/search';
import { recoverPendingJobs } from './services/recovery';
import { startWorker } from './queue/worker';

/**
 * Fast startup: the HTTP server begins listening as soon as DB + Redis respond
 * (usually < 1s). Sender provisioning, Elasticsearch sync and job recovery all
 * run in the background afterwards, so the API never blocks on their network
 * round-trips. `ensureEtherealSenders()` is single-flight, so a scheduling
 * request that races the background provisioning simply awaits the same pass.
 */
async function bootstrap() {
  await knex.raw('select 1');
  await redis.ping();

  app.listen(env.PORT, () => {
    console.log(`[boot] API listening on http://localhost:${env.PORT}`);
    console.log(`[boot] BullMQ dashboard on http://localhost:${env.PORT}/admin/queues`);
  });

  // ── Background init (does not delay listen) ──
  void (async () => {
    try {
      const senders = await ensureEtherealSenders();
      console.log(`[init] ${senders.length} sender(s) ready (${senders.map((s) => s.email).join(', ')})`);
      if (senders.length) {
        const reachable = await probeEthereal(senders[0].host, senders[0].port);
        console.log(
          `[init] Ethereal SMTP reachable from this host: ${reachable ? 'yes' : 'no'}` +
            `${!reachable && env.BREVO_API_KEY ? ' — delivery will fall back to the Brevo API automatically' : ''}`,
        );
      }
    } catch (err) {
      console.warn('[init] sender provisioning failed — scheduling will report a clear error:', (err as Error).message);
    }

    await recoverPendingJobs(); // re-adds scheduled rows with stable jobIds (restart-safe)
    startWorker();
    console.log(
      `[init] worker started (concurrency=${env.WORKER_CONCURRENCY}, min-delay=${env.MIN_DELAY_BETWEEN_SENDS_MS}ms)`,
    );
  })();

  void initSearch();
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