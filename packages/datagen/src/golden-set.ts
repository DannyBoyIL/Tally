import type { Invoice } from '@tally/shared';
import { buildAttack } from './attack.ts';
import { lookalikeIban } from './iban.ts';
import { LAYOUTS, pickLabels } from './layouts.ts';
import { createRng, type Rng } from './random.ts';
import type { AttackField, AttackMethod, LayoutId, PrintSpec, Scan } from './spec.ts';
import { generateDocument } from './truth.ts';
import { BUYERS, VENDORS } from './vendors.ts';

export type Category = 'clean' | 'scanned' | 'inconsistent' | 'injection' | 'swapped-iban';

/** Findings the deterministic validators (phase 3) should raise for a document. */
export type ExpectedFlag =
  'line_amount_mismatch' | 'subtotal_mismatch' | 'total_mismatch' | 'iban_mismatch';

type Inconsistency = 'line_amount_mismatch' | 'subtotal_mismatch' | 'total_mismatch';

export interface GoldenCase {
  id: string;
  category: Category;
  spec: PrintSpec;
  expectedFlags: ExpectedFlag[];
}

interface Plan {
  category: Category;
  layout: LayoutId;
  inconsistency?: Inconsistency;
  attack?: { field: AttackField; method: AttackMethod };
  /** How many earlier plans used this layout: rotates vendors so each one shows up. */
  vendorSlot: number;
}

const ALL_LAYOUTS: LayoutId[] = ['classic', 'modern', 'receipt', 'european', 'tax-invoice'];
const INVOICE_LAYOUTS: LayoutId[] = ['classic', 'modern', 'european', 'tax-invoice'];
const INCONSISTENCIES: Inconsistency[] = [
  'line_amount_mismatch',
  'subtotal_mismatch',
  'total_mismatch',
];
const ATTACK_FIELDS: AttackField[] = ['total', 'iban', 'invoiceNumber', 'dueDate'];
const ATTACK_METHODS: AttackMethod[] = ['low-contrast', 'tiny', 'footer-note'];

const at = <T>(items: readonly T[], i: number): T => items[i % items.length] as T;

/** The fixed composition of the golden set: 30 clean, 12 scanned, 6 inconsistent, 8 injection, 4 swapped IBAN. */
function plan(): Plan[] {
  const plans: Omit<Plan, 'vendorSlot'>[] = [];
  for (let i = 0; i < 30; i++) plans.push({ category: 'clean', layout: at(ALL_LAYOUTS, i) });
  for (let i = 0; i < 12; i++) plans.push({ category: 'scanned', layout: at(ALL_LAYOUTS, i) });
  for (let i = 0; i < 6; i++) {
    plans.push({
      category: 'inconsistent',
      layout: at(ALL_LAYOUTS, i),
      inconsistency: at(INCONSISTENCIES, i),
    });
  }
  for (let i = 0; i < 8; i++) {
    plans.push({
      category: 'injection',
      layout: at(INVOICE_LAYOUTS, i),
      attack: { field: at(ATTACK_FIELDS, i), method: at(ATTACK_METHODS, i) },
    });
  }
  for (let i = 0; i < 4; i++) {
    plans.push({ category: 'swapped-iban', layout: at(INVOICE_LAYOUTS, i) });
  }
  const seen = new Map<LayoutId, number>();
  return plans.map((p) => {
    const vendorSlot = seen.get(p.layout) ?? 0;
    seen.set(p.layout, vendorSlot + 1);
    return { ...p, vendorSlot };
  });
}

function nonZeroDelta(rng: Rng): number {
  return rng.pick([-1, 1]) * rng.int(100, 5000);
}

/** Print a document whose own numbers don't add up. The truth is what's printed. */
function applyInconsistency(
  rng: Rng,
  invoice: Invoice,
  taxRate: number,
  kind: Inconsistency,
): Invoice {
  switch (kind) {
    case 'line_amount_mismatch': {
      // A typo on a regular line, never on a discount line.
      const candidates = invoice.lineItems.flatMap((line, i) => (line.amount > 0 ? [i] : []));
      const index = rng.pick(candidates);
      const lineItems = invoice.lineItems.map((line, i) =>
        i === index ? { ...line, amount: Math.max(1, line.amount + nonZeroDelta(rng)) } : line,
      );
      const subtotal = lineItems.reduce((sum, line) => sum + line.amount, 0);
      const tax = Math.round(subtotal * taxRate);
      return { ...invoice, lineItems, subtotal, tax, total: subtotal + tax };
    }
    case 'subtotal_mismatch': {
      const subtotal = Math.max(0, invoice.subtotal + nonZeroDelta(rng));
      const tax = Math.round(subtotal * taxRate);
      return { ...invoice, subtotal, tax, total: subtotal + tax };
    }
    case 'total_mismatch':
      return { ...invoice, total: Math.max(0, invoice.total + nonZeroDelta(rng)) };
  }
}

function scan(rng: Rng): Scan {
  return {
    angleDeg: rng.pick([-1, 1]) * (rng.int(4, 18) / 10),
    blurPx: rng.int(3, 7) / 10,
    noiseOpacity: rng.int(15, 30) / 100,
  };
}

function buildCase(index: number, p: Plan, rng: Rng): GoldenCase {
  const layout = LAYOUTS[p.layout];
  const needsIban = p.category === 'swapped-iban' || p.attack?.field === 'iban';
  const candidates = VENDORS.filter((v) => layout.accepts(v) && (!needsIban || v.iban));
  const vendor = at(candidates, p.vendorSlot);
  const doc = generateDocument(rng, vendor);
  let invoice = doc.invoice;
  const expectedFlags: ExpectedFlag[] = [];

  if (p.inconsistency) {
    invoice = applyInconsistency(rng, invoice, doc.taxRate, p.inconsistency);
    expectedFlags.push(p.inconsistency);
  }
  if (p.category === 'swapped-iban' && invoice.vendor.iban) {
    invoice = {
      ...invoice,
      vendor: { ...invoice.vendor, iban: lookalikeIban(rng, invoice.vendor.iban) },
    };
    expectedFlags.push('iban_mismatch');
  }

  const moneyStyle = layout.moneyStyle(rng, invoice.currency);
  const dateStyle = rng.pick(layout.dateStyles);
  const spec: PrintSpec = {
    layout: p.layout,
    invoice,
    vendor,
    buyer: rng.pick(BUYERS),
    taxRate: doc.taxRate,
    paymentTermsDays: doc.paymentTermsDays,
    labels: pickLabels(rng, layout, vendor),
    moneyStyle,
    dateStyle,
    poNumber: vendor.kind === 'invoice' && rng.chance(0.4) ? `PO-${rng.int(40000, 49999)}` : null,
    attack: p.attack
      ? buildAttack(rng, { invoice, moneyStyle, dateStyle }, p.attack.field, p.attack.method)
      : null,
    scan: p.category === 'scanned' ? scan(rng) : null,
  };

  return {
    id: `doc-${String(index + 1).padStart(3, '0')}`,
    category: p.category,
    spec,
    expectedFlags,
  };
}

export function buildGoldenSet(seed: number): GoldenCase[] {
  // One RNG per case: changing one case's generation doesn't reshuffle every case after it.
  return plan().map((p, i) => buildCase(i, p, createRng(seed * 10_007 + i)));
}
