import { describe, expect, it } from 'vitest';
import { addDays, formatDate, formatMoney, formatPercent } from './format.ts';

describe('formatMoney', () => {
  it.each([
    [123456, 'USD', 'symbol', '$1,234.56'],
    [-500, 'GBP', 'symbol', '-£5.00'],
    [123456789, 'USD', 'code', '1,234,567.89 USD'],
    [123456, 'EUR', 'eu', '1.234,56 €'],
    [5, 'EUR', 'eu', '0,05 €'],
  ] as const)('%i %s %s -> %s', (minor, currency, style, expected) => {
    expect(formatMoney(minor, currency, style)).toBe(expected);
  });
});

describe('formatDate', () => {
  it.each([
    ['iso', '2026-03-04'],
    ['long', 'March 4, 2026'],
    ['d-mon-y', '4 Mar 2026'],
    ['dmy-dots', '04.03.2026'],
  ] as const)('%s', (style, expected) => {
    expect(formatDate('2026-03-04', style)).toBe(expected);
  });
});

describe('helpers', () => {
  it('formats tax rates without float noise', () => {
    expect(formatPercent(0.0725)).toBe('7.25%');
    expect(formatPercent(0.1025)).toBe('10.25%');
    expect(formatPercent(0.19)).toBe('19%');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19');
  });
});
