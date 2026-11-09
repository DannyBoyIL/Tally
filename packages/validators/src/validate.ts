import type { Flag, Invoice } from '@tally/shared';
import { injectionReasons } from './injection.ts';
import { findVendor, type VendorRecord } from './vendors.ts';

export interface Finding {
  flag: Flag;
  reason: string;
}

export interface ValidationInput {
  invoice: Invoice;
  vendors: readonly VendorRecord[];
  /** Text the extractor reported as addressed to the reader; empty when the prompt has no such field. */
  notices?: readonly string[];
}

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const cents = (n: number): string => (n / 100).toFixed(2);

/** ISO 13616: move the country code and check digits to the end, letters to numbers, mod 97 = 1. */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

/**
 * Deterministic checks on an extracted invoice. Every finding sends the document to a human with
 * a reason; nothing here changes a value. Findings come back in FLAGS order.
 */
export function validate({ invoice, vendors, notices = [] }: ValidationInput): Finding[] {
  const findings: Finding[] = [];

  invoice.lineItems.forEach((line, i) => {
    const expected = Math.round(line.quantity * line.unitPrice);
    // One cent of slack: a fractional quantity times a price can round either way on paper.
    if (Math.abs(expected - line.amount) > 1) {
      findings.push({
        flag: 'line_amount_mismatch',
        reason: `line ${i + 1}: ${line.quantity} × ${cents(line.unitPrice)} = ${cents(expected)}, printed ${cents(line.amount)}`,
      });
    }
  });

  const lineSum = invoice.lineItems.reduce((sum, line) => sum + line.amount, 0);
  if (lineSum !== invoice.subtotal) {
    findings.push({
      flag: 'subtotal_mismatch',
      reason: `lines add up to ${cents(lineSum)}, subtotal is ${cents(invoice.subtotal)}`,
    });
  }

  if (invoice.subtotal + invoice.tax !== invoice.total) {
    findings.push({
      flag: 'total_mismatch',
      reason: `${cents(invoice.subtotal)} + ${cents(invoice.tax)} tax = ${cents(invoice.subtotal + invoice.tax)}, total is ${cents(invoice.total)}`,
    });
  }

  if (invoice.dueDate !== null && invoice.dueDate < invoice.issueDate) {
    findings.push({
      flag: 'due_before_issue',
      reason: `due ${invoice.dueDate} is before issue ${invoice.issueDate}`,
    });
  }

  if (!ISO_CURRENCIES.has(invoice.currency)) {
    findings.push({
      flag: 'currency_unknown',
      reason: `${invoice.currency} is not an ISO 4217 code`,
    });
  }

  const { iban } = invoice.vendor;
  if (iban !== null && !isValidIban(iban)) {
    findings.push({ flag: 'iban_invalid', reason: `${iban} fails the IBAN checksum` });
  }

  const vendor = findVendor(vendors, invoice.vendor);
  if (!vendor) {
    findings.push({
      flag: 'vendor_unknown',
      reason: `"${invoice.vendor.name}" is not in vendor master data`,
    });
  } else if (iban !== null && iban !== vendor.iban) {
    findings.push({
      flag: 'iban_mismatch',
      reason: vendor.iban
        ? `${vendor.name} is paid to ${vendor.iban}, this document says ${iban}`
        : `${vendor.name} has no IBAN on file, this document says ${iban}`,
    });
  }

  for (const reason of injectionReasons(notices)) {
    findings.push({ flag: 'injection_suspected', reason });
  }
  return findings;
}

/** The distinct flags of a list of findings, in FLAGS order. */
export const flagsOf = (findings: readonly Finding[]): Flag[] => [
  ...new Set(findings.map((f) => f.flag)),
];
