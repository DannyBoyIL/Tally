import type { Invoice, LineItem } from '@tally/shared';
import { addDays } from './format.ts';
import type { Rng } from './random.ts';
import type { VendorProfile } from './vendors.ts';

export interface GeneratedDocument {
  invoice: Invoice;
  /** Printed next to the tax line; not part of the schema. */
  taxRate: number;
  paymentTermsDays: number | null;
}

/** A consistent document: every amount adds up. Inconsistencies are applied later, on purpose. */
export function generateDocument(rng: Rng, vendor: VendorProfile): GeneratedDocument {
  const isReceipt = vendor.kind === 'receipt';
  const pool = [...vendor.catalog];
  const lineItems: LineItem[] = [];
  const count = rng.int(1, Math.min(pool.length, isReceipt ? 5 : 6));

  for (let i = 0; i < count; i++) {
    const [item] = pool.splice(rng.int(0, pool.length - 1), 1);
    if (!item) break;
    const [min, max] = item.price;
    const hours = item.unit === 'hours';
    // Hourly rates are round numbers; goods are priced to the nearest 5 cents.
    const unitPrice = hours
      ? Math.round(rng.int(min, max) / 500) * 500
      : Math.round(rng.int(min, max) / 5) * 5;
    const quantity = hours ? rng.int(2, 32) / 2 : rng.int(1, isReceipt ? 3 : 12);
    lineItems.push({
      description: item.description,
      quantity,
      unitPrice,
      amount: Math.round(quantity * unitPrice),
    });
  }

  if (!isReceipt && rng.chance(0.15)) {
    const gross = lineItems.reduce((sum, line) => sum + line.amount, 0);
    const discount = Math.round((gross * rng.int(5, 10)) / 100);
    lineItems.push({
      description: 'Loyalty discount',
      quantity: 1,
      unitPrice: -discount,
      amount: -discount,
    });
  }

  const subtotal = lineItems.reduce((sum, line) => sum + line.amount, 0);
  const tax = Math.round(subtotal * vendor.taxRate);
  const issueDate = addDays('2026-01-05', rng.int(0, 290));
  const paymentTermsDays = isReceipt ? null : rng.pick([14, 30, 45]);

  return {
    invoice: {
      documentType: isReceipt ? 'receipt' : 'invoice',
      vendor: { name: vendor.name, taxId: vendor.taxId, iban: vendor.iban },
      invoiceNumber: isReceipt ? null : vendor.invoiceNumber(rng),
      issueDate,
      dueDate: paymentTermsDays === null ? null : addDays(issueDate, paymentTermsDays),
      currency: vendor.currency,
      lineItems,
      subtotal,
      tax,
      total: subtotal + tax,
    },
    taxRate: vendor.taxRate,
    paymentTermsDays,
  };
}
