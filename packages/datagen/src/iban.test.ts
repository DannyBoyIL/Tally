import { describe, expect, it } from 'vitest';
import { formatIban, lookalikeIban, makeIban } from './iban.ts';
import { createRng } from './random.ts';

describe('IBAN', () => {
  it.each([
    ['GB', 'WEST12345698765432', 'GB82WEST12345698765432'],
    ['DE', '370400440532013000', 'DE89370400440532013000'],
    ['NL', 'ABNA0417164300', 'NL91ABNA0417164300'],
  ])('computes check digits for %s (published example)', (country, bban, expected) => {
    expect(makeIban(country, bban)).toBe(expected);
  });

  it('prints in groups of four', () => {
    expect(formatIban('GB82WEST12345698765432')).toBe('GB82 WEST 1234 5698 7654 32');
  });

  it('makes a different IBAN with the same shape and a valid checksum', () => {
    const original = 'GB82WEST12345698765432';
    const fake = lookalikeIban(createRng(1), original);
    expect(fake).not.toBe(original);
    expect(fake).toMatch(/^GB\d{2}WEST\d{14}$/);
    expect(makeIban('GB', fake.slice(4))).toBe(fake);
  });
});
