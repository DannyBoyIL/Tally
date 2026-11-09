import type { DocumentStatus, Flag } from '@tally/shared';

export const FLAG_LABELS: Record<Flag, string> = {
  line_amount_mismatch: 'Line amount ≠ quantity × price',
  subtotal_mismatch: 'Lines don’t add up to the subtotal',
  total_mismatch: 'Subtotal + tax ≠ total',
  due_before_issue: 'Due date before issue date',
  currency_unknown: 'Unknown currency',
  iban_invalid: 'IBAN fails its checksum',
  vendor_unknown: 'Vendor not in master data',
  iban_mismatch: 'IBAN differs from vendor master data',
  injection_suspected: 'Suspicious instructions in the document',
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  needs_review: 'Needs review',
  approved: 'Approved',
  rejected: 'Rejected',
};
