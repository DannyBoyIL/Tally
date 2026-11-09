import { describe, expect, it } from 'vitest';
import { toInvoice, type LlmInvoice } from './llm-schema.ts';

const output = (overrides: Partial<LlmInvoice> = {}): LlmInvoice => ({
  documentType: 'invoice',
  vendor: { name: 'Acme GmbH', taxId: 'DE123456789', iban: 'de89 3704 0044 0532 0130 00' },
  invoiceNumber: 'INV-1',
  issueDate: '2026-03-01',
  dueDate: null,
  currency: ' eur ',
  lineItems: [
    { description: 'Widget', quantity: 3, unitPrice: 4.35, amount: 13.05 },
    { description: 'Discount', quantity: 1, unitPrice: -1.1, amount: -1.1 },
  ],
  subtotal: 11.95,
  tax: 2.27,
  total: 14.22,
  ...overrides,
});

describe('toInvoice', () => {
  it('converts decimal money to integer cents without float drift', () => {
    const result = toInvoice(output());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 4.35 * 100 is 434.99999999999994 in floating point.
    expect(result.invoice.lineItems[0]).toMatchObject({ unitPrice: 435, amount: 1305 });
    expect(result.invoice.lineItems[1]).toMatchObject({ unitPrice: -110, amount: -110 });
    expect(result.invoice).toMatchObject({ subtotal: 1195, tax: 227, total: 1422 });
  });

  it('stores the IBAN compact and uppercase, and the currency trimmed', () => {
    const result = toInvoice(output());
    expect(result.ok && result.invoice.vendor.iban).toBe('DE89370400440532013000');
    expect(result.ok && result.invoice.currency).toBe('EUR');
  });

  it('keeps nulls as nulls', () => {
    const result = toInvoice(
      output({ vendor: { name: 'Corner Cafe', taxId: null, iban: null }, invoiceNumber: null }),
    );
    expect(result.ok && result.invoice.vendor).toEqual({
      name: 'Corner Cafe',
      taxId: null,
      iban: null,
    });
  });

  it('rejects what the strict schema rejects, naming the field', () => {
    const result = toInvoice(output({ issueDate: '01/03/2026' }));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('issueDate') as string });
  });

  it('rejects a negative total', () => {
    expect(toInvoice(output({ total: -5 })).ok).toBe(false);
  });
});
