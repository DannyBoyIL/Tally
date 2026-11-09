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

// Serif, bordered table, vendor top right, bank details in the footer.
export function classic(spec: PrintSpec): string {
  const { invoice, vendor, buyer, labels } = spec;
  const css = `
    .sheet{width:794px;min-height:1123px;padding:56px 64px;font:13px/1.5 Georgia,'Times New Roman',serif;color:#222}
    header{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:18px}
    h1{font-size:30px;letter-spacing:6px;margin:0 0 12px}
    .meta td{padding:1px 14px 1px 0}
    .vendor{text-align:right}
    .vendor strong{font-size:16px}
    h3{font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:28px 0 4px;color:#555}
    table.items{width:100%;margin-top:28px}
    .items th,.items td{border:1px solid #999;padding:6px 8px}
    .items th{background:#f1f1f1;text-align:left}
    table.totals{margin:18px 0 0 auto;width:320px}
    .totals td{padding:4px 8px}
    .totals .grand td{font-weight:bold;font-size:15px;border-top:2px solid #222}
    footer{margin-top:48px;border-top:1px solid #bbb;padding-top:12px;font-size:12px;color:#444}`;
  const body = `
    <header>
      <div>
        <h1>INVOICE</h1>
        <table class="meta">
          <tr><td>${esc(labels.invoiceNumber)}</td><td>${esc(invoice.invoiceNumber ?? '')}</td></tr>
          <tr><td>${esc(labels.issueDate)}</td><td>${date(spec, invoice.issueDate)}</td></tr>
          ${invoice.dueDate ? `<tr><td>${esc(labels.dueDate)}</td><td>${date(spec, invoice.dueDate)}</td></tr>` : ''}
          ${spec.poNumber ? `<tr><td>PO Number</td><td>${esc(spec.poNumber)}</td></tr>` : ''}
        </table>
      </div>
      <div class="vendor">
        <strong>${esc(invoice.vendor.name)}</strong><br>${lines(vendor.address)}<br>${esc(vendor.phone)}<br>${taxIdLine(spec)}
      </div>
    </header>
    <h3>Bill to</h3>
    <div>${esc(buyer.name)}<br>${lines(buyer.address)}</div>
    <table class="items">
      <tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr>
      ${itemRows(spec)}
    </table>
    <table class="totals">${totalRows(spec)}</table>
    <footer>
      ${ibanLine(spec) ? `<div>Bank transfer to ${esc(invoice.vendor.name)} &middot; ${ibanLine(spec)}</div>` : ''}
      <div>${termsLine(spec)}</div>
      ${attackHtml(spec)}
    </footer>`;
  return page(spec, css, body);
}
