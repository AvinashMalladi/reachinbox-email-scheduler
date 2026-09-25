import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.hasColumn('senders', 'secure').then(async (has) => {
    if (!has) {
      await knex.schema.alterTable('senders', (t) => {
        t.boolean('secure').notNullable().defaultTo(false);
      });
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.hasColumn('senders', 'secure').then(async (has) => {
    if (has) {
      await knex.schema.alterTable('senders', (t) => {
        t.dropColumn('secure');
      });
    }
  });
}