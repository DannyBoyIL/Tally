import type { PrintSpec } from '../spec.ts';
import {
  amount,
  attackHtml,
  date,
  esc,
  lines,
  money,
  page,
  qty,
  taxIdLine,
  taxLabel,
} from './common.ts';

// Narrow thermal-printer receipt, monospace, no invoice number or due date.
export function receipt(spec: PrintSpec): string {
  const { invoice, vendor, labels } = spec;
  const css = `
    .sheet{width:340px;padding:24px 20px 32px;font:13px/1.45 'Courier New',Courier,monospace;color:#111}
    .c{text-align:center}
    .name{font-size:17px;font-weight:bold}
    hr{border:none;border-top:1px dashed #333;margin:10px 0}
    table{width:100%}
    td{padding:1px 0;vertical-align:top}
    .sub{padding-left:12px;font-size:12px;color:#333}
    .grand td{font-weight:bold;font-size:15px;padding-top:4px}`;
  const items = invoice.lineItems
    .map(
      (line) =>
        `<tr><td>${esc(line.description)}</td><td class="n">${amount(spec, line.amount)}</td></tr>` +
        // "1 x price" is noise when it equals the amount; print it whenever it carries information.
        (line.quantity === 1 && line.unitPrice === line.amount
          ? ''
          : `<tr><td class="sub">${qty(spec, line.quantity)} x ${amount(spec, line.unitPrice)}</td><td></td></tr>`),
    )
    .join('');
  const time = `${String(8 + (invoice.subtotal % 11)).padStart(2, '0')}:${String(invoice.total % 60).padStart(2, '0')}`;
  const body = `
    <div class="c name">${esc(invoice.vendor.name)}</div>
    <div class="c">${lines(vendor.address)}<br>${esc(vendor.phone)}${taxIdLine(spec) ? `<br>${taxIdLine(spec)}` : ''}</div>
    <hr>
    <div>${date(spec, invoice.issueDate)} ${time}</div>
    <hr>
    <table>${items}</table>
    <hr>
    <table>
      <tr><td>${esc(labels.subtotal)}</td><td class="n">${money(spec, invoice.subtotal)}</td></tr>
      <tr><td>${taxLabel(spec)}</td><td class="n">${money(spec, invoice.tax)}</td></tr>
      <tr class="grand"><td>${esc(labels.total)}</td><td class="n">${money(spec, invoice.total)}</td></tr>
    </table>
    <hr>
    <div class="c">THANK YOU - PLEASE COME AGAIN</div>
    ${attackHtml(spec)}`;
  return page(spec, css, body);
}
