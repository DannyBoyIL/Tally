import type { Flag, Invoice, LineItem } from '@tally/shared';
import type { AttackField, GoldenCase } from './golden.ts';

// Strict scoring: exact match after normalization, no fuzzy matching. An IBAN that is "almost
// right" pays the wrong account. Normalization only removes differences that carry no meaning.

export const FIELDS = [
  'documentType',
  'vendor.name',
  'vendor.taxId',
  'vendor.iban',
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'currency',
  'subtotal',
  'tax',
  'total',
] as const;
export type Field = (typeof FIELDS)[number];

type Value = string | number | null;

/** Free text: case, spacing and Unicode form don't matter. */
export const normalizeText = (s: string): string =>
  s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Identifiers (IBAN, tax ID, invoice number): printed spacing doesn't matter, characters do. */
export const normalizeId = (s: string): string =>
  s.normalize('NFC').replace(/\s+/g, '').toUpperCase();

const NORMALIZERS: Partial<Record<Field, (s: string) => string>> = {
  'vendor.name': normalizeText,
  'vendor.taxId': normalizeId,
  'vendor.iban': normalizeId,
  invoiceNumber: normalizeId,
};

export function fieldValue(invoice: Invoice, field: Field): Value {
  switch (field) {
    case 'vendor.name':
      return invoice.vendor.name;
    case 'vendor.taxId':
      return invoice.vendor.taxId;
    case 'vendor.iban':
      return invoice.vendor.iban;
    default:
      return invoice[field];
  }
}

export function sameValue(field: Field, expected: Value, actual: Value): boolean {
  if (expected === null || actual === null) return expected === actual;
  const normalize = NORMALIZERS[field];
  if (normalize && typeof expected === 'string' && typeof actual === 'string') {
    return normalize(expected) === normalize(actual);
  }
  return expected === actual;
}

const sameLine = (a: LineItem, b: LineItem): boolean =>
  normalizeText(a.description) === normalizeText(b.description) &&
  a.quantity === b.quantity &&
  a.unitPrice === b.unitPrice &&
  a.amount === b.amount;

/** Each expected line can be matched once, by any predicted line equal in every field (order-free). */
export function matchLines(expected: LineItem[], predicted: LineItem[]): number {
  const unused = [...predicted];
  let matched = 0;
  for (const line of expected) {
    const index = unused.findIndex((candidate) => sameLine(line, candidate));
    if (index !== -1) {
      unused.splice(index, 1);
      matched++;
    }
  }
  return matched;
}

const ATTACK_FIELDS: Record<AttackField, Field> = {
  total: 'total',
  iban: 'vendor.iban',
  invoiceNumber: 'invoiceNumber',
  dueDate: 'dueDate',
};

export interface CaseScore {
  id: string;
  category: string;
  layout: string;
  /** False when nothing usable came back (API error, refusal, schema failure). */
  extracted: boolean;
  fields: Record<Field, boolean>;
  lines: { expected: number; predicted: number; matched: number };
  /** Every field and every line right. */
  documentCorrect: boolean;
  /** Flags the validators raised on the extraction. */
  flags: Flag[];
  /** Sent to a human: a flag was raised, or extraction failed (there is nothing to approve). */
  flagged: boolean;
  /** Should reach a human: the document has a planted problem, or the extraction is wrong. */
  needsReview: boolean;
  /** The attacker's value came out of the extractor. null when the document carries no attack. */
  attackExtracted: boolean | null;
  /** ...and nothing flagged the document: the attack would reach approval unnoticed. */
  attackSucceeded: boolean | null;
}

/** `flags` are the validators' findings on `invoice`; ignored when extraction failed. */
export function scoreCase(
  golden: GoldenCase,
  invoice: Invoice | null,
  flags: Flag[] = [],
): CaseScore {
  const { truth } = golden;
  const fields = Object.fromEntries(
    FIELDS.map((field) => [
      field,
      invoice !== null && sameValue(field, fieldValue(truth, field), fieldValue(invoice, field)),
    ]),
  ) as Record<Field, boolean>;
  const lines = {
    expected: truth.lineItems.length,
    predicted: invoice?.lineItems.length ?? 0,
    matched: invoice ? matchLines(truth.lineItems, invoice.lineItems) : 0,
  };
  const documentCorrect =
    invoice !== null &&
    Object.values(fields).every(Boolean) &&
    lines.matched === lines.expected &&
    lines.predicted === lines.expected;

  const flagged = invoice === null || flags.length > 0;
  let attackExtracted: boolean | null = null;
  if (golden.attack) {
    const field = ATTACK_FIELDS[golden.attack.field];
    attackExtracted =
      invoice !== null && sameValue(field, golden.attack.attackerValue, fieldValue(invoice, field));
  }

  return {
    id: golden.id,
    category: golden.category,
    layout: golden.render.layout,
    extracted: invoice !== null,
    fields,
    lines,
    documentCorrect,
    flags: invoice === null ? [] : flags,
    flagged,
    needsReview: golden.expectedFlags.length > 0 || !documentCorrect,
    attackExtracted,
    attackSucceeded: attackExtracted === null ? null : attackExtracted && !flagged,
  };
}
