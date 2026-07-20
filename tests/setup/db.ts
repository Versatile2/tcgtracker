import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '../../src/db/schema';

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('DATABASE_URL_TEST is not set');

const pool = new Pool({ connectionString: url });
export const testDb = drizzle(pool, { schema });

export function getTestDb() {
  return testDb;
}

export async function resetDb() {
  await testDb.execute(
    sql`TRUNCATE TABLE rounds, tournaments, sets, leaders RESTART IDENTITY CASCADE`,
  );
}
