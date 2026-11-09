import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';

const MIGRATIONS = join(import.meta.dirname, 'migrations');

/**
 * Applies the numbered .sql files in order, each once, each in a transaction. Plain SQL on
 * purpose: the schema is the most important design in the app and should be readable as-is.
 */
export async function migrate(pool: pg.Pool): Promise<string[]> {
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const { rows } = await pool.query<{ name: string }>('select name from schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files.filter((f) => !done.has(f))) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(await readFile(join(MIGRATIONS, file), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      applied.push(file);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
  return applied;
}
