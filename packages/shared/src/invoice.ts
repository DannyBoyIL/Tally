import { z } from 'zod';

// The canonical shape of an extracted (or ground-truth) document.
//
// This schema checks structure and formats only. Cross-field rules (line items sum to the
// subtotal, subtotal + tax = total, ...) are validators, not schema refinements: a document
// whose own totals don't add up must still be representable, so the validators can flag it.

/** Money as integer minor units (cents), so validation arithmetic is exact. */
export const MinorUnits = z.number().int();

/** ISO 4217 code, e.g. "USD". Whether the code exists is a validator's job. */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'expected a 3-letter ISO 4217 code');

/** A real calendar date as YYYY-MM-DD. */
export const IsoDate = z.iso.date();

export const DocumentType = z.enum(['invoice', 'receipt']);

export const Vendor = z.object({
  name: z.string().min(1),
  taxId: z.string().min(1).nullable(),
  iban: z.string().min(1).nullable(),
});

export const LineItem = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: MinorUnits,
  // Negative amounts are allowed: discounts appear as lines.
  amount: MinorUnits,
});

export const Invoice = z.object({
  documentType: DocumentType,
  vendor: Vendor,
  // Receipts often have no number or due date.
  invoiceNumber: z.string().min(1).nullable(),
  issueDate: IsoDate,
  dueDate: IsoDate.nullable(),
  currency: CurrencyCode,
  lineItems: z.array(LineItem),
  subtotal: MinorUnits.nonnegative(),
  tax: MinorUnits.nonnegative(),
  total: MinorUnits.nonnegative(),
});

export type DocumentType = z.infer<typeof DocumentType>;
export type Vendor = z.infer<typeof Vendor>;
export type LineItem = z.infer<typeof LineItem>;
export type Invoice = z.infer<typeof Invoice>;
