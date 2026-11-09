import type { Invoice } from '@tally/shared';
import { describe, expect, it } from 'vitest';
import {
  applyEdit,
  deriveFinal,
  editedFields,
  isEditable,
  readField,
  ReviewError,
  statusOf,
  type EditRecord,
} from './review.ts';

const original: Invoice = {
  documentType: 'invoice',
  vendor: { name: 'Acme GmbH', taxId: 'DE123456789', iban: 'DE89370400440532013000' },
  invoiceNumber: 'INV-1',
  issueDate: '2026-03-01',
  dueDate: '2026-03-31',
  currency: 'EUR',
  lineItems: [{ description: 'Widget', quantity: 3, unitPrice: 435, amount: 1305 }],
  subtotal: 1305,
  tax: 248,
  total: 1500,
};

const edit = (field: string, newValue: unknown): EditRecord => ({ type: 'edit', field, newValue });

describe('applyEdit', () => {
  it('changes one field and leaves the original untouched', () => {
    const next = applyEdit(original, 'total', 1553);
    expect(next.total).toBe(1553);
    expect(original.total).toBe(1500);
  });

  it('edits a field of an existing line', () => {
    expect(applyEdit(original, 'lineItems.0.amount', 1300).lineItems[0]?.amount).toBe(1300);
  });

  it('normalizes an IBAN the way the extractor does, and an empty one to null', () => {
    expect(applyEdit(original, 'vendor.iban', 'gb82 west 1234 5698 7654 32').vendor.iban).toBe(
      'GB82WEST12345698765432',
    );
    expect(applyEdit(original, 'vendor.iban', ' ').vendor.iban).toBeNull();
  });

  it.each([
    ['lineItems.5.amount', 1],
    ['lineItems.0.colour', 'red'],
    ['vendor', 'x'],
    ['__proto__.polluted', 'x'],
  ])('refuses the path %s', (path, value) => {
    expect(() => applyEdit(original, path, value)).toThrow(ReviewError);
  });

  it.each([
    ['issueDate', '01/03/2026'],
    ['total', 15.5],
    ['total', -1],
    ['currency', 'euro'],
    ['documentType', 'memo'],
  ])('refuses %s = %j because the schema does', (path, value) => {
    expect(() => applyEdit(original, path, value)).toThrow(/^.+: /);
  });
});

describe('deriveFinal', () => {
  it('replays edits in order; the last edit of a field wins', () => {
    const final = deriveFinal(original, [
      edit('total', 1600),
      { type: 'approve', field: null, newValue: null },
      edit('total', 1553),
      edit('invoiceNumber', 'INV-01'),
    ]);
    expect(final).toMatchObject({ total: 1553, invoiceNumber: 'INV-01' });
  });

  it('returns the original when nothing was edited', () => {
    expect(deriveFinal(original, [])).toEqual(original);
  });
});

describe('editedFields', () => {
  it('lists fields that differ from the extraction, not fields edited back', () => {
    const events = [edit('total', 1553), edit('tax', 300), edit('tax', 248)];
    expect(editedFields(original, deriveFinal(original, events), events)).toEqual(['total']);
  });
});

describe('statusOf', () => {
  it('follows the decision', () => {
    expect(statusOf([])).toBe('needs_review');
    expect(statusOf([edit('total', 1)])).toBe('needs_review');
    expect(statusOf([{ type: 'approve', field: null, newValue: null }])).toBe('approved');
    expect(statusOf([{ type: 'reject', field: null, newValue: null }])).toBe('rejected');
  });
});

describe('isEditable / readField', () => {
  it('reads nested and line fields', () => {
    expect(readField(original, 'vendor.taxId')).toBe('DE123456789');
    expect(readField(original, 'lineItems.0.quantity')).toBe(3);
    expect(isEditable(original, 'lineItems.0.quantity')).toBe(true);
    expect(isEditable(original, 'lineItems.1.quantity')).toBe(false);
  });
});
