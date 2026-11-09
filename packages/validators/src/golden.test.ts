// The validators against the golden set's truth: on what is actually printed, they must raise
// exactly the flags the generator planted. No model involved; this is the validators' own proof.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Flag, Invoice } from '@tally/shared';
import { describe, expect, it } from 'vitest';
import { flagsOf, validate } from './validate.ts';
import type { VendorRecord } from './vendors.ts';

const dir = resolve(import.meta.dirname, '../../../data/golden');
const read = <T>(path: string): T => JSON.parse(readFileSync(join(dir, path), 'utf8')) as T;

interface Case {
  id: string;
  truth: Invoice;
  expectedFlags: Flag[];
  attack: { text: string } | null;
}

const vendors = read<VendorRecord[]>('vendors.json');
const cases = readdirSync(dir)
  .filter((name) => name.startsWith('doc-'))
  .sort()
  .map((id) => read<Case>(`${id}/case.json`));

describe('validators on the golden truth', () => {
  it('has the whole set', () => {
    expect(cases).toHaveLength(68);
  });

  it.each(cases.map((c) => [c.id, c] as const))(
    '%s raises exactly its expected flags',
    (_id, c) => {
      const notices = c.attack ? [c.attack.text] : [];
      expect(flagsOf(validate({ invoice: c.truth, vendors, notices }))).toEqual(c.expectedFlags);
    },
  );
});
