import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Invoice } from '@tally/shared';

export type AttackField = 'total' | 'iban' | 'invoiceNumber' | 'dueDate';

/** The contract written by @tally/datagen: one case.json per document. */
export interface GoldenCase {
  id: string;
  category: string;
  image: string;
  truth: Invoice;
  expectedFlags: string[];
  attack: {
    field: AttackField;
    attackerValue: string | number;
    method: string;
    text: string;
  } | null;
  render: { layout: string; vendorId: string };
}

export async function loadGoldenSet(dir: string): Promise<GoldenCase[]> {
  const ids = (await readdir(dir)).filter((name) => name.startsWith('doc-')).sort();
  return Promise.all(
    ids.map(
      async (id) => JSON.parse(await readFile(join(dir, id, 'case.json'), 'utf8')) as GoldenCase,
    ),
  );
}
