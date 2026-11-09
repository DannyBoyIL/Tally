// Pure review logic: no database, no HTTP. The final invoice is never stored; it is the
// extraction with the reviewer's edits replayed in order, so history can't drift from the result.
import { Invoice, type DocumentStatus } from '@tally/shared';

type Value = string | number | null;

const SCALAR_FIELDS = new Set([
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
]);
const LINE_FIELD = /^lineItems\.(\d+)\.(description|quantity|unitPrice|amount)$/;

export class ReviewError extends Error {
  override name = 'ReviewError';
  readonly status: 400 | 409 | 422;
  constructor(message: string, status: 400 | 409 | 422) {
    super(message);
    this.status = status;
  }
}

/** Editable paths: the scalar fields, and any field of an existing line. */
export function isEditable(invoice: Invoice, path: string): boolean {
  if (SCALAR_FIELDS.has(path)) return true;
  const match = LINE_FIELD.exec(path);
  return match !== null && Number(match[1]) < invoice.lineItems.length;
}

export function readField(invoice: Invoice, path: string): Value {
  const [head, ...rest] = path.split('.');
  let node: unknown = (invoice as unknown as Record<string, unknown>)[head ?? ''];
  for (const key of rest) node = (node as Record<string, unknown>)[key];
  return node as Value;
}

/** Same normalization the extractor applies, so an edited IBAN compares like an extracted one. */
function normalize(path: string, value: Value): Value {
  if (typeof value !== 'string') return value;
  if (path === 'vendor.iban' || path === 'vendor.taxId')
    return value.replace(/\s+/g, '').toUpperCase() || null;
  if (path === 'currency') return value.trim().toUpperCase();
  return value.trim();
}

/** Returns a new invoice with one field changed; rejects anything the strict schema rejects. */
export function applyEdit(invoice: Invoice, path: string, value: Value): Invoice {
  if (!isEditable(invoice, path)) throw new ReviewError(`${path} is not an editable field`, 400);
  const next = structuredClone(invoice) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  const last = keys.pop() as string;
  let node = next;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = normalize(path, value);
  const parsed = Invoice.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ReviewError(`${path}: ${issue?.message ?? 'invalid value'}`, 400);
  }
  return parsed.data;
}

export interface EditRecord {
  type: 'edit' | 'approve' | 'reject';
  field: string | null;
  newValue: unknown;
}

export function deriveFinal(original: Invoice, events: readonly EditRecord[]): Invoice {
  return events.reduce(
    (invoice, e) =>
      e.type === 'edit' && e.field ? applyEdit(invoice, e.field, e.newValue as Value) : invoice,
    original,
  );
}

/** Fields whose final value differs from what the model extracted. */
export function editedFields(
  original: Invoice,
  final: Invoice,
  events: readonly EditRecord[],
): string[] {
  const touched = [
    ...new Set(events.flatMap((e) => (e.type === 'edit' && e.field ? [e.field] : []))),
  ];
  return touched.filter((path) => readField(original, path) !== readField(final, path));
}

/** The last decision wins; there can only be one, because decided documents refuse new events. */
export function statusOf(events: readonly EditRecord[]): DocumentStatus {
  const decision = events.findLast((e) => e.type !== 'edit');
  if (decision?.type === 'approve') return 'approved';
  if (decision?.type === 'reject') return 'rejected';
  return 'needs_review';
}
