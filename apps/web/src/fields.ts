import { parseMoney } from './money.ts';

export type FieldKind =
  | 'text'
  | 'optionalText'
  | 'iban'
  | 'date'
  | 'optionalDate'
  | 'money'
  | 'quantity'
  | 'documentType';
export type FieldValue = string | number | null;

export interface FieldDef {
  path: string;
  label: string;
  kind: FieldKind;
}

export const HEADER_FIELDS: FieldDef[] = [
  { path: 'documentType', label: 'Document type', kind: 'documentType' },
  { path: 'invoiceNumber', label: 'Invoice number', kind: 'optionalText' },
  { path: 'issueDate', label: 'Issue date', kind: 'date' },
  { path: 'dueDate', label: 'Due date', kind: 'optionalDate' },
  { path: 'currency', label: 'Currency', kind: 'text' },
];

export const VENDOR_FIELDS: FieldDef[] = [
  { path: 'vendor.name', label: 'Vendor', kind: 'text' },
  { path: 'vendor.taxId', label: 'Tax ID', kind: 'optionalText' },
  { path: 'vendor.iban', label: 'IBAN', kind: 'iban' },
];

export const TOTAL_FIELDS: FieldDef[] = [
  { path: 'subtotal', label: 'Subtotal', kind: 'money' },
  { path: 'tax', label: 'Tax', kind: 'money' },
  { path: 'total', label: 'Total', kind: 'money' },
];

export const LINE_COLUMNS: { key: string; label: string; kind: FieldKind }[] = [
  { key: 'description', label: 'Description', kind: 'text' },
  { key: 'quantity', label: 'Qty', kind: 'quantity' },
  { key: 'unitPrice', label: 'Unit price', kind: 'money' },
  { key: 'amount', label: 'Amount', kind: 'money' },
];

/** The text an input starts with when a reviewer opens a field. */
export function toInput(kind: FieldKind, value: FieldValue): string {
  if (value === null) return '';
  if (kind === 'money' && typeof value === 'number') return (value / 100).toFixed(2);
  return String(value);
}

/** What the reviewer typed, as the API expects it; a string result is an error message. */
export function fromInput(
  kind: FieldKind,
  input: string,
): { value: FieldValue } | { error: string } {
  const text = input.trim();
  switch (kind) {
    case 'money': {
      const cents = parseMoney(text);
      return cents === null ? { error: 'Enter an amount, e.g. 1,234.56' } : { value: cents };
    }
    case 'quantity': {
      const n = Number(text.replace(',', '.'));
      return text && Number.isFinite(n) ? { value: n } : { error: 'Enter a number' };
    }
    case 'optionalText':
    case 'iban':
    case 'optionalDate':
      return { value: text || null };
    default:
      return text ? { value: text } : { error: 'Required' };
  }
}
