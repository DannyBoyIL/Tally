import { Invoice } from '@tally/shared';
import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, formatMoney, formatQuantity } from './format.ts';
import { buildGoldenSet, type ExpectedFlag, type GoldenCase } from './golden-set.ts';
import { formatIban } from './iban.ts';
import { renderHtml } from './layouts.ts';
import { vendorMasterData } from './vendors.ts';

const SEED = 2026;
const cases = buildGoldenSet(SEED);

/** The text a reader would see: no CSS, no tags, entities decoded. */
function visibleText(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** Every value of the truth, formatted the way this document prints it. */
function printedValues({ spec }: GoldenCase): string[] {
  const { invoice, moneyStyle, dateStyle } = spec;
  const values = [
    invoice.vendor.name,
    formatDate(invoice.issueDate, dateStyle),
    formatMoney(invoice.subtotal, invoice.currency, moneyStyle),
    formatMoney(invoice.tax, invoice.currency, moneyStyle),
    formatMoney(invoice.total, invoice.currency, moneyStyle),
  ];
  if (invoice.vendor.taxId) values.push(invoice.vendor.taxId);
  if (invoice.vendor.iban) values.push(formatIban(invoice.vendor.iban));
  if (invoice.invoiceNumber) values.push(invoice.invoiceNumber);
  if (invoice.dueDate) values.push(formatDate(invoice.dueDate, dateStyle));
  for (const line of invoice.lineItems) {
    values.push(line.description, formatAmount(line.amount, moneyStyle));
    values.push(formatAmount(line.unitPrice, moneyStyle));
    if (line.quantity !== 1) values.push(formatQuantity(line.quantity, moneyStyle));
  }
  return values;
}

/** Reference arithmetic checks: which inconsistencies does the printed document contain? */
function arithmeticFindings(invoice: Invoice): ExpectedFlag[] {
  const findings: ExpectedFlag[] = [];
  if (invoice.lineItems.some((l) => l.amount !== Math.round(l.quantity * l.unitPrice))) {
    findings.push('line_amount_mismatch');
  }
  if (invoice.lineItems.reduce((sum, l) => sum + l.amount, 0) !== invoice.subtotal) {
    findings.push('subtotal_mismatch');
  }
  if (invoice.subtotal + invoice.tax !== invoice.total) findings.push('total_mismatch');
  return findings;
}

const masterIban = new Map(vendorMasterData().map((v) => [v.name, v.iban]));

describe('golden set composition', () => {
  it('has the planned 68 documents', () => {
    const counts = Object.fromEntries(
      ['clean', 'scanned', 'inconsistent', 'injection', 'swapped-iban', 'injection-visible'].map(
        (category) => [category, cases.filter((c) => c.category === category).length],
      ),
    );
    expect(counts).toEqual({
      clean: 30,
      scanned: 12,
      inconsistent: 6,
      injection: 8,
      'swapped-iban': 4,
      'injection-visible': 8,
    });
    expect(new Set(cases.map((c) => c.id)).size).toBe(68);
  });

  it('covers every layout in the clean and scanned sets', () => {
    for (const category of ['clean', 'scanned']) {
      const layouts = new Set(
        cases.filter((c) => c.category === category).map((c) => c.spec.layout),
      );
      expect(layouts.size).toBe(5);
    }
  });

  it('uses every vendor at least once', () => {
    const used = new Set(cases.map((c) => c.spec.vendor.id));
    expect([...used].sort()).toEqual(
      vendorMasterData()
        .map((v) => v.id)
        .sort(),
    );
  });

  it('labels tax as VAT exactly when the vendor is outside the US', () => {
    for (const c of cases) {
      expect(c.spec.labels.tax === 'VAT').toBe(c.spec.vendor.country !== 'US');
    }
  });

  it('is deterministic for a seed and changes with the seed', () => {
    const again = buildGoldenSet(SEED);
    expect(again.map((c) => renderHtml(c.spec))).toEqual(cases.map((c) => renderHtml(c.spec)));
    expect(buildGoldenSet(SEED + 1)[0]?.spec.invoice).not.toEqual(cases[0]?.spec.invoice);
  });
});

describe.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
  const { invoice } = c.spec;
  const html = renderHtml(c.spec);

  it('truth passes the shared schema', () => {
    expect(Invoice.safeParse(invoice).success).toBe(true);
  });

  it('prints every truth value (truth = what is on the page)', () => {
    const text = visibleText(html);
    const missing = printedValues(c).filter((value) => !text.includes(value));
    expect(missing).toEqual([]);
  });

  it('adds up exactly as its expected flags say', () => {
    const arithmetic = c.expectedFlags.filter(
      (f) => f !== 'iban_mismatch' && f !== 'injection_suspected',
    );
    expect(arithmeticFindings(invoice)).toEqual(arithmetic);
  });

  it('flags an IBAN mismatch exactly when the printed IBAN differs from master data', () => {
    const { iban } = invoice.vendor;
    const mismatch = iban !== null && iban !== masterIban.get(invoice.vendor.name);
    expect(c.expectedFlags.includes('iban_mismatch')).toBe(mismatch);
  });

  it('expects injection_suspected exactly when the document carries an attack', () => {
    expect(c.expectedFlags.includes('injection_suspected')).toBe(c.spec.attack !== null);
  });

  if (c.spec.attack) {
    const attack = c.spec.attack;
    it('carries an attack whose value differs from the truth and is printed only in the attack text', () => {
      const truthValue = {
        total: invoice.total,
        iban: invoice.vendor.iban,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
      }[attack.field];
      expect(attack.attackerValue).not.toEqual(truthValue);
      const withoutAttack = visibleText(html.replace(/<p class="attack"[\s\S]*?<\/p>/, ''));
      expect(withoutAttack).not.toContain(String(attack.attackerValue));
      expect(visibleText(html)).toContain(attack.text);
    });
  }
});
