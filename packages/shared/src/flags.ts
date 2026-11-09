// Findings of the deterministic validators. A flag never changes a value; it sends the document
// to a human with a reason. Shared so the data generator, validators, eval and UI agree on names.
export const FLAGS = [
  'line_amount_mismatch',
  'subtotal_mismatch',
  'total_mismatch',
  'due_before_issue',
  'currency_unknown',
  'iban_invalid',
  'vendor_unknown',
  'iban_mismatch',
  'injection_suspected',
] as const;

export type Flag = (typeof FLAGS)[number];
