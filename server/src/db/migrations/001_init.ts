import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email').notNullable().unique();
    t.string('google_id').unique();
    t.string('name');
    t.string('avatar');
    t.jsonb('google_profile');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('senders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('email').notNullable().unique();
    t.string('name').notNullable();
    t.string('host').notNullable();
    t.integer('port').notNullable();
    t.string('username').notNullable();
    t.string('password').notNullable();
    t.boolean('is_ethereal').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('email_jobs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.uuid('sender_id').references('id').inTable('senders').onDelete('SET NULL');
    t.string('batch_id');
    t.string('recipient').notNullable();
    t.string('subject').notNullable();
    t.text('body').notNullable();
    t.timestamp('scheduled_at').notNullable();
    t.integer('delay_between_ms').notNullable().defaultTo(0);
    t.integer('hourly_limit').nullable();
    t.string('status').notNullable().defaultTo('scheduled');
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('sent_at');
    t.string('message_id');
    t.string('preview_url');
    t.text('last_error');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('email_jobs', (t) => {
    t.index(['status', 'scheduled_at']);
    t.index(['user_id', 'status']);
    t.index(['batch_id']);
  });

  await knex.schema.createTable('slack_connections', (t) => {
    t.uuid('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    t.string('team_id');
    t.string('team_name');
    t.string('access_token').notNullable();
    t.string('bot_user_id');
    t.string('channel_id');
    t.timestamp('connected_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('slack_connections');
  await knex.schema.dropTableIfExists('email_jobs');
  await knex.schema.dropTableIfExists('senders');
  await knex.schema.dropTableIfExists('users');
}