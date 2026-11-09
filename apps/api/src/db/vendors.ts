import type { VendorRecord } from '@tally/validators';
import type pg from 'pg';

/** Loads vendor master data (insert or update by id). */
export async function upsertVendors(pool: pg.Pool, vendors: VendorRecord[]): Promise<void> {
  for (const v of vendors) {
    await pool.query(
      `insert into vendors (id, name, tax_id, iban) values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, tax_id = excluded.tax_id, iban = excluded.iban`,
      [v.id, v.name, v.taxId, v.iban],
    );
  }
}

export async function listVendors(pool: pg.Pool): Promise<VendorRecord[]> {
  const { rows } = await pool.query<VendorRecord>(
    'select id, name, tax_id as "taxId", iban from vendors order by id',
  );
  return rows;
}
