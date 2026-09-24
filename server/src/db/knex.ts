import knexFactory, { type Knex } from 'knex';
import { env } from '../config/env';

export const knex: Knex = knexFactory({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: { directory: `${__dirname}/migrations`, extension: 'ts' },
});

export default knex;