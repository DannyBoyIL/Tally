// pnpm --filter @tally/api migrate   apply pending migrations
// pnpm --filter @tally/api seed      load vendor master data from data/golden/vendors.json
// node src/db/cli.ts reset           drop and re-migrate a disposable (_test / _e2e / _demo) database
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { VendorRecord } from '@tally/validators';
import pg from 'pg';
import { loadConfig } from '../config.ts';
import { ensureDatabase, resetDatabase } from './admin.ts';
import { migrate } from './migrate.ts';
import { upsertVendors } from './vendors.ts';

const command = process.argv[2];
const config = loadConfig(process.env);
if (command === 'reset') await ensureDatabase(config.databaseUrl);
const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  if (command === 'migrate') {
    const applied = await migrate(pool);
    console.log(applied.length ? `Applied ${applied.join(', ')}` : 'Up to date');
  } else if (command === 'reset') {
    await resetDatabase(pool, config.databaseUrl);
    console.log('Database reset');
  } else if (command === 'seed') {
    const file = resolve(import.meta.dirname, '../../../../data/golden/vendors.json');
    const vendors = JSON.parse(await readFile(file, 'utf8')) as VendorRecord[];
    await upsertVendors(pool, vendors);
    console.log(`Loaded ${vendors.length} vendors`);
  } else {
    console.error('Usage: cli.ts migrate|seed|reset');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
