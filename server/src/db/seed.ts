import knex from './knex';

async function main() {
  const count = await knex('senders').count<{ count: string }>('* as count').first();
  console.log(`[seed] senders present: ${count?.count ?? 0} (senders are auto-provisioned at boot via Ethereal)`);
  const users = await knex('users').count<{ count: string }>('* as count').first();
  console.log(`[seed] users present: ${users?.count ?? 0}`);
  await knex.destroy();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[seed] failed:', err);
  await knex.destroy();
  process.exit(1);
});