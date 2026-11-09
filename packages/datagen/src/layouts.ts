import type { DateStyle, MoneyStyle } from './format.ts';
import type { Rng } from './random.ts';
import type { Labels, LayoutId, PrintSpec } from './spec.ts';
import { classic } from './templates/classic.ts';
import { european } from './templates/european.ts';
import { modern } from './templates/modern.ts';
import { receipt } from './templates/receipt.ts';
import { taxInvoice } from './templates/tax-invoice.ts';
import type { VendorProfile } from './vendors.ts';

interface Layout {
  render: (spec: PrintSpec) => string;
  /** CSS width of `.sheet`, used as the viewport width. */
  width: number;
  accepts: (vendor: VendorProfile) => boolean;
  moneyStyle: (rng: Rng, currency: string) => MoneyStyle;
  dateStyles: DateStyle[];
  /** Label pools. The tax label is not here: it follows the vendor's country. */
  labels: { [K in Exclude<keyof Labels, 'tax'>]: string[] };
}

const INVOICE_LABELS: Layout['labels'] = {
  invoiceNumber: ['Invoice No.', 'Invoice #', 'Invoice Number'],
  issueDate: ['Date', 'Invoice Date', 'Issue Date'],
  dueDate: ['Due Date', 'Payment Due', 'Due'],
  subtotal: ['Subtotal', 'Net Amount', 'Sub-total'],
  total: ['Total', 'Amount Due', 'Balance Due', 'Total Due', 'Grand Total'],
};

export const LAYOUTS: Record<LayoutId, Layout> = {
  classic: {
    render: classic,
    width: 794,
    accepts: (v) => v.kind === 'invoice',
    moneyStyle: (rng) => rng.pick(['symbol', 'code'] as const),
    dateStyles: ['long', 'd-mon-y'],
    labels: INVOICE_LABELS,
  },
  modern: {
    render: modern,
    width: 794,
    accepts: (v) => v.kind === 'invoice',
    moneyStyle: (rng) => rng.pick(['symbol', 'code'] as const),
    dateStyles: ['iso', 'd-mon-y'],
    labels: INVOICE_LABELS,
  },
  european: {
    render: european,
    width: 794,
    accepts: (v) => v.kind === 'invoice' && v.currency === 'EUR',
    moneyStyle: () => 'eu',
    dateStyles: ['dmy-dots'],
    labels: {
      ...INVOICE_LABELS,
      issueDate: ['Invoice date', 'Date'],
      subtotal: ['Net total', 'Subtotal'],
      total: ['Gross total', 'Total amount', 'Total'],
    },
  },
  'tax-invoice': {
    render: taxInvoice,
    width: 794,
    accepts: (v) => v.kind === 'invoice' && v.country === 'GB',
    moneyStyle: () => 'symbol',
    dateStyles: ['d-mon-y', 'long'],
    labels: {
      ...INVOICE_LABELS,
      subtotal: ['Total excl. VAT', 'Net'],
      total: ['Total incl. VAT', 'Amount Due', 'Total Payable'],
    },
  },
  receipt: {
    render: receipt,
    width: 340,
    accepts: (v) => v.kind === 'receipt',
    moneyStyle: (_rng, currency) => (currency === 'EUR' ? 'eu' : 'symbol'),
    dateStyles: ['iso', 'd-mon-y'],
    labels: {
      ...INVOICE_LABELS,
      subtotal: ['SUBTOTAL', 'Subtotal'],
      total: ['TOTAL', 'Total', 'AMOUNT PAID'],
    },
  },
};

export function pickLabels(rng: Rng, layout: Layout, vendor: VendorProfile): Labels {
  return {
    invoiceNumber: rng.pick(layout.labels.invoiceNumber),
    issueDate: rng.pick(layout.labels.issueDate),
    dueDate: rng.pick(layout.labels.dueDate),
    subtotal: rng.pick(layout.labels.subtotal),
    tax: vendor.country === 'US' ? rng.pick(['Tax', 'Sales Tax']) : 'VAT',
    total: rng.pick(layout.labels.total),
  };
}

export function renderHtml(spec: PrintSpec): string {
  return LAYOUTS[spec.layout].render(spec);
}

/** Viewport width for the screenshot: the sheet plus the scan margin. */
export function viewportWidth(spec: PrintSpec): number {
  return LAYOUTS[spec.layout].width + (spec.scan ? 56 : 0);
}
