import { describe, expect, it } from 'vitest';
import { Invoice } from './invoice.ts';

const validInvoice = {
  documentType: 'invoice',
  vendor: { name: 'Acme Supplies Ltd', taxId: 'GB123456789', iban: 'GB82WEST12345698765432' },
  invoiceNumber: 'INV-1042',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  currency: 'USD',
  lineItems: [
    { description: 'Printer paper', quantity: 10, unitPrice: 450, amount: 4500 },
    { description: 'Loyalty discount', quantity: 1, unitPrice: -500, amount: -500 },
  ],
  subtotal: 4000,
  tax: 800,
  total: 4800,
};

describe('Invoice schema', () => {
  it('accepts a valid invoice', () => {
    expect(Invoice.safeParse(validInvoice).success).toBe(true);
  });

  it('accepts a receipt without number, due date, tax ID or IBAN', () => {
    const receipt = {
      ...validInvoice,
      documentType: 'receipt',
      vendor: { name: 'Corner Cafe', taxId: null, iban: null },
      invoiceNumber: null,
      dueDate: null,
    };
    expect(Invoice.safeParse(receipt).success).toBe(true);
  });

  it('accepts totals that do not add up: that is a validator finding, not a schema error', () => {
    expect(Invoice.safeParse({ ...validInvoice, total: 1 }).success).toBe(true);
  });

  it.each([
    ['fractional money', { total: 48.0001 }],
    ['negative total', { total: -1 }],
    ['impossible date', { issueDate: '2026-02-30' }],
    ['non-ISO date format', { issueDate: '01/10/2026' }],
    ['lowercase currency', { currency: 'usd' }],
    ['unknown document type', { documentType: 'quote' }],
  ])('rejects %s', (_label, override) => {
    expect(Invoice.safeParse({ ...validInvoice, ...override }).success).toBe(false);
  });

  it('rejects a missing field instead of defaulting it', () => {
    const { tax, ...withoutTax } = validInvoice;
    expect(Invoice.safeParse(withoutTax).success).toBe(false);
  });
});
