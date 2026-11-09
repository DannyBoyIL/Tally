import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney } from './money.ts';

describe('parseMoney', () => {
  it.each([
    ['55.91', 5591],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['€ 12', 1200],
    ['1,234', 123400],
    ['-10.00', -1000],
    ['0.07', 7],
  ])('%s → %i cents', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(['', 'abc', '1-2', '--5', '40.1555.91', '1,23,456.00', '12.345.6'])(
    '%j is not money',
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );
});

describe('formatMoney', () => {
  it('formats cents in the document currency', () => {
    expect(formatMoney(123456, 'EUR')).toBe('€1,234.56');
  });

  it('still shows an amount with an unknown currency code', () => {
    expect(formatMoney(500, 'EUX')).toMatch(/5\.00/);
  });
});
