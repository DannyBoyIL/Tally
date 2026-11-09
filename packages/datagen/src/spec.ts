import type { Invoice } from '@tally/shared';
import type { DateStyle, MoneyStyle } from './format.ts';
import type { Buyer, VendorProfile } from './vendors.ts';

export type LayoutId = 'classic' | 'modern' | 'receipt' | 'european' | 'tax-invoice';

export interface Labels {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  tax: string;
  total: string;
}

export type AttackField = 'total' | 'iban' | 'invoiceNumber' | 'dueDate';
/**
 * Hidden methods address an automated reader and hide from humans. `notice` is visible and
 * written like ordinary business text (credit note, bank change, AP reference, extended terms),
 * the way real invoice fraud reads.
 */
export type AttackMethod = 'low-contrast' | 'tiny' | 'footer-note' | 'notice';

/** Instruction-like text planted in the document to push one field to the attacker's value. */
export interface Attack {
  field: AttackField;
  attackerValue: string | number;
  method: AttackMethod;
  text: string;
}

/** Simulated scan: applied with CSS before the screenshot. */
export interface Scan {
  angleDeg: number;
  blurPx: number;
  noiseOpacity: number;
}

/** Everything a template needs to print one document. `invoice` is the ground truth. */
export interface PrintSpec {
  layout: LayoutId;
  invoice: Invoice;
  vendor: VendorProfile;
  buyer: Buyer;
  taxRate: number;
  paymentTermsDays: number | null;
  labels: Labels;
  moneyStyle: MoneyStyle;
  dateStyle: DateStyle;
  poNumber: string | null;
  attack: Attack | null;
  scan: Scan | null;
}
