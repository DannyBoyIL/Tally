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

// UK "TAX INVOICE": centred title, From / To columns, VAT number prominent,
// remittance slip with bank details at the bottom.
export function taxInvoice(spec: PrintSpec): string {
  const { invoice, vendor, buyer, labels } = spec;
  const css = `
    .sheet{width:794px;min-height:1123px;padding:50px 60px;font:13px/1.5 Verdana,Geneva,sans-serif;color:#1a1a1a}
    h1{text-align:center;font-size:22px;letter-spacing:3px;margin:0 0 6px}
    .vat{text-align:center;font-size:12px;margin-bottom:28px}
    .parties{display:flex;gap:24px}
    .parties>div{flex:1;border:1px solid #888;padding:10px 14px}
    .parties .k{font-weight:bold;font-size:11px;text-transform:uppercase;margin-bottom:4px}
    .meta{display:flex;gap:24px;margin:16px 0}
    .meta div{flex:1;background:#eee;padding:6px 10px;font-size:12px}
    table.items{width:100%;margin-top:8px}
    .items th{background:#1a1a1a;color:#fff;text-align:left;padding:6px 8px;font-size:12px}
    .items td{padding:6px 8px;border-bottom:1px solid #ccc}
    table.totals{margin:12px 0 0 auto;width:330px}
    .totals td{padding:4px 8px;border-bottom:1px solid #ccc}
    .totals .grand td{font-weight:bold;background:#eee}
    .remit{margin-top:56px;border-top:2px dashed #888;padding-top:14px;font-size:12px}`;
  const body = `
    <h1>TAX INVOICE</h1>
    <div class="vat">${taxIdLine(spec)}</div>
    <div class="parties">
      <div><div class="k">From</div><strong>${esc(invoice.vendor.name)}</strong><br>${lines(vendor.address)}<br>${esc(vendor.phone)}</div>
      <div><div class="k">To</div>${esc(buyer.name)}<br>${lines(buyer.address)}</div>
    </div>
    <div class="meta">
      <div>${esc(labels.invoiceNumber)}: <b>${esc(invoice.invoiceNumber ?? '')}</b></div>
      <div>${esc(labels.issueDate)}: <b>${date(spec, invoice.issueDate)}</b></div>
      ${invoice.dueDate ? `<div>${esc(labels.dueDate)}: <b>${date(spec, invoice.dueDate)}</b></div>` : ''}
    </div>
    <table class="items">
      <tr><th>Description</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Net</th></tr>
      ${itemRows(spec)}
    </table>
    <table class="totals">${totalRows(spec)}</table>
    <div class="remit">
      <b>Remittance advice</b><br>
      Please pay ${esc(invoice.vendor.name)}${spec.poNumber ? `, quoting PO ${esc(spec.poNumber)}` : ''}.<br>
      ${ibanLine(spec)}<br>${termsLine(spec)}
      ${attackHtml(spec)}
    </div>`;
  return page(spec, css, body);
}
