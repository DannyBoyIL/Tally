import pg from 'pg';
import { migrate } from './migrate.ts';

/** Creates the database named in `url` if it doesn't exist (via the server's postgres database). */
export async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const adminUrl = new URL(target);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`Postgres is not reachable at ${target.host} (docker compose up -d db)`, {
      cause: error,
    });
  }
  try {
    const exists = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (exists.rowCount === 0) await admin.query(`create database "${name.replaceAll('"', '""')}"`);
  } finally {
    await admin.end();
  }
}

/**
 * Throws away every table and re-migrates. Only for disposable databases: refuses any database
 * whose name doesn't end in _test, _e2e or _demo (the public demo resets daily), so it can't wipe
 * development data.
 */
export async function resetDatabase(pool: pg.Pool, url: string): Promise<void> {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/_(test|e2e|demo)$/.test(name)) throw new Error(`refusing to reset database "${name}"`);
  await pool.query('drop schema public cascade; create schema public;');
  await migrate(pool);
}
