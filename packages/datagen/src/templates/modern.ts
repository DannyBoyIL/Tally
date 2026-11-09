import type { PrintSpec } from '../spec.ts';
import {
  attackHtml,
  date,
  esc,
  ibanLine,
  itemRows,
  lines,
  page,
  taxIdLine,
  termsLine,
  totalRows,
} from './common.ts';

// Sans-serif, accent bar, borderless rows; vendor details live in the footer columns,
// so the only thing at the top is the vendor's name as a wordmark.
export function modern(spec: PrintSpec): string {
  const { invoice, vendor, buyer, labels } = spec;
  const css = `
    .sheet{width:794px;min-height:1123px;padding:0 0 40px;font:13px/1.55 'Helvetica Neue',Arial,sans-serif;color:#1d2433}
    .bar{background:#2f5bea;color:#fff;padding:36px 56px;display:flex;justify-content:space-between;align-items:flex-end}
    .brand{font-size:24px;font-weight:700;letter-spacing:-0.5px}
    .bar .doc{text-align:right;font-size:12px;opacity:.95}
    .bar .doc b{display:block;font-size:22px;letter-spacing:1px}
    .info{display:flex;gap:56px;padding:32px 56px 8px}
    .info .k{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a8396}
    table.items{width:calc(100% - 112px);margin:24px 56px 0}
    .items th{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#7a8396;text-align:left;padding:8px 0;border-bottom:2px solid #1d2433}
    .items td{padding:10px 0;border-bottom:1px solid #e3e6ee}
    .items .n{padding-left:16px}
    .sum{margin:24px 56px 0 auto;width:330px;background:#f3f5fb;padding:14px 20px}
    .sum table{width:100%}
    .sum td{padding:3px 0}
    .sum .grand td{font-size:17px;font-weight:700;color:#2f5bea;padding-top:8px}
    footer{margin:56px 56px 0;padding-top:16px;border-top:1px solid #e3e6ee;display:flex;gap:40px;font-size:11px;color:#59627a}`;
  const body = `
    <div class="bar">
      <div class="brand">${esc(invoice.vendor.name)}</div>
      <div class="doc"><b>Invoice</b>${esc(labels.invoiceNumber)} ${esc(invoice.invoiceNumber ?? '')}</div>
    </div>
    <div class="info">
      <div><div class="k">Billed to</div>${esc(buyer.name)}<br>${lines(buyer.address)}</div>
      <div><div class="k">${esc(labels.issueDate)}</div>${date(spec, invoice.issueDate)}</div>
      ${invoice.dueDate ? `<div><div class="k">${esc(labels.dueDate)}</div>${date(spec, invoice.dueDate)}</div>` : ''}
      ${spec.poNumber ? `<div><div class="k">PO</div>${esc(spec.poNumber)}</div>` : ''}
    </div>
    <table class="items">
      <tr><th>Item</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Total</th></tr>
      ${itemRows(spec)}
    </table>
    <div class="sum"><table>${totalRows(spec)}</table></div>
    <footer>
      <div>${esc(invoice.vendor.name)}<br>${lines(vendor.address)}</div>
      <div>${esc(vendor.phone)}<br>${taxIdLine(spec)}</div>
      <div>${ibanLine(spec)}<br>${termsLine(spec)}${attackHtml(spec)}</div>
    </footer>`;
  return page(spec, css, body);
}
