import knex from './knex';

async function main() {
  const [, pending] = await knex.migrate.latest();
  console.log(`[migrate] done, applied: ${pending.length ? pending.join(', ') : 'none (already up to date)'}`);
  await knex.destroy();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[migrate] failed:', err);
  await knex.destroy();
  process.exit(1);
});