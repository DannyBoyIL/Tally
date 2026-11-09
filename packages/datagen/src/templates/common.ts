import { formatIban } from '../iban.ts';
import { formatAmount, formatDate, formatMoney, formatPercent, formatQuantity } from '../format.ts';
import type { PrintSpec } from '../spec.ts';

export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const money = (spec: PrintSpec, minor: number): string =>
  esc(formatMoney(minor, spec.invoice.currency, spec.moneyStyle));
export const amount = (spec: PrintSpec, minor: number): string =>
  esc(formatAmount(minor, spec.moneyStyle));
export const date = (spec: PrintSpec, iso: string): string => esc(formatDate(iso, spec.dateStyle));
export const qty = (spec: PrintSpec, quantity: number): string =>
  esc(formatQuantity(quantity, spec.moneyStyle));
export const lines = (rows: string[]): string => rows.map(esc).join('<br>');

export function taxLabel(spec: PrintSpec): string {
  return esc(`${spec.labels.tax} (${formatPercent(spec.taxRate)})`);
}

export function taxIdLine(spec: PrintSpec): string {
  const { taxId } = spec.invoice.vendor;
  if (!taxId) return '';
  const label = spec.vendor.country === 'US' ? 'EIN' : 'VAT No.';
  return `${label}: ${esc(taxId)}`;
}

export function ibanLine(spec: PrintSpec): string {
  const { iban } = spec.invoice.vendor;
  return iban ? `IBAN: ${esc(formatIban(iban))}` : '';
}

export function termsLine(spec: PrintSpec): string {
  return spec.paymentTermsDays === null
    ? ''
    : `Payment terms: net ${spec.paymentTermsDays} days. Thank you for your business.`;
}

/** Item rows as <tr>s: description, quantity, unit price, amount. */
export function itemRows(spec: PrintSpec): string {
  return spec.invoice.lineItems
    .map(
      (line) =>
        `<tr><td>${esc(line.description)}</td><td class="n">${qty(spec, line.quantity)}</td>` +
        `<td class="n">${amount(spec, line.unitPrice)}</td><td class="n">${amount(spec, line.amount)}</td></tr>`,
    )
    .join('');
}

/** Subtotal, tax and total rows as <tr>s; the last row has class "grand". */
export function totalRows(spec: PrintSpec): string {
  const { invoice, labels } = spec;
  return (
    `<tr><td>${esc(labels.subtotal)}</td><td class="n">${money(spec, invoice.subtotal)}</td></tr>` +
    `<tr><td>${taxLabel(spec)}</td><td class="n">${money(spec, invoice.tax)}</td></tr>` +
    `<tr class="grand"><td>${esc(labels.total)}</td><td class="n">${money(spec, invoice.total)}</td></tr>`
  );
}

const ATTACK_STYLES = {
  'low-contrast': 'color:#ededed;font-size:10px;',
  tiny: 'color:#999;font-size:4.5px;',
  'footer-note': 'color:#555;font-size:10px;font-style:italic;',
} as const;

export function attackHtml(spec: PrintSpec): string {
  if (!spec.attack) return '';
  return `<p class="attack" style="${ATTACK_STYLES[spec.attack.method]}margin:14px 0 0;">${esc(spec.attack.text)}</p>`;
}

const NOISE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'>" +
  "<feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>";

function scanCss(spec: PrintSpec): string {
  if (!spec.scan) return 'body{margin:0;background:#fff}';
  const { angleDeg, blurPx, noiseOpacity } = spec.scan;
  return `
    body{margin:0;padding:28px;background:#ddd9cf;position:relative}
    .sheet{transform:rotate(${angleDeg}deg);filter:grayscale(1) blur(${blurPx}px) contrast(1.2) brightness(0.97);box-shadow:0 1px 8px rgba(0,0,0,.35)}
    body::after{content:"";position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:${noiseOpacity};
      background-image:url("data:image/svg+xml;utf8,${NOISE_SVG}")}`;
}

/** Full HTML page; every template puts its content in `.sheet`. */
export function page(spec: PrintSpec, css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    .sheet{background:#fff}
    table{border-collapse:collapse}
    ${css}
    .sheet td.n,.sheet th.n{text-align:right;white-space:nowrap}
    ${scanCss(spec)}
  </style></head><body><div class="sheet">${body}</div></body></html>`;
}
