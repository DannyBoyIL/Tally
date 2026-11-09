// A real Postgres for integration tests: a separate database, rebuilt from the migrations.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { VendorRecord } from '@tally/validators';
import pg from 'pg';
import { ensureDatabase, resetDatabase } from '../db/admin.ts';
import { upsertVendors } from '../db/vendors.ts';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://tally:tally@localhost:5432/tally_test';

export async function freshDatabase(): Promise<pg.Pool> {
  await ensureDatabase(TEST_DATABASE_URL);
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL });
  await resetDatabase(pool, TEST_DATABASE_URL);
  const vendors = JSON.parse(
    await readFile(resolve(import.meta.dirname, '../../../../data/golden/vendors.json'), 'utf8'),
  ) as VendorRecord[];
  await upsertVendors(pool, vendors);
  return pool;
}
