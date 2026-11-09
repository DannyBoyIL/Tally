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

// Business-letter style: sender line above the address window, info box on the right,
// legal details (address, VAT ID, IBAN) in a three-column footer.
export function european(spec: PrintSpec): string {
  const { invoice, vendor, buyer, labels } = spec;
  const css = `
    .sheet{width:794px;min-height:1123px;padding:48px 70px 40px;font:12.5px/1.5 Arial,Helvetica,sans-serif;color:#222;position:relative}
    .logo{text-align:right;font-size:20px;font-weight:bold;color:#444;margin-bottom:36px}
    .top{display:flex;justify-content:space-between}
    .sender{font-size:9px;color:#666;border-bottom:1px solid #999;margin-bottom:8px;padding-bottom:2px;width:300px}
    .box{border:1px solid #bbb;padding:10px 14px;width:250px}
    .box td{padding:1px 10px 1px 0}
    h2{font-size:18px;margin:48px 0 16px}
    table.items{width:100%}
    .items th{border-bottom:1px solid #222;text-align:left;padding:5px 4px}
    .items td{padding:5px 4px;border-bottom:1px solid #ddd}
    table.totals{margin:14px 0 0 auto;width:300px}
    .totals td{padding:3px 4px}
    .totals .grand td{font-weight:bold;border-top:1px solid #222;border-bottom:3px double #222}
    .terms{margin-top:28px}
    footer{position:absolute;left:70px;right:70px;bottom:40px;display:flex;justify-content:space-between;border-top:1px solid #999;padding-top:8px;font-size:10px;color:#555}`;
  const body = `
    <div class="logo">${esc(invoice.vendor.name)}</div>
    <div class="top">
      <div>
        <div class="sender">${esc(invoice.vendor.name)} · ${esc(vendor.address.slice(0, 2).join(' · '))}</div>
        ${esc(buyer.name)}<br>${lines(buyer.address)}
      </div>
      <table class="box">
        <tr><td>${esc(labels.invoiceNumber)}</td><td>${esc(invoice.invoiceNumber ?? '')}</td></tr>
        <tr><td>${esc(labels.issueDate)}</td><td>${date(spec, invoice.issueDate)}</td></tr>
        ${invoice.dueDate ? `<tr><td>${esc(labels.dueDate)}</td><td>${date(spec, invoice.dueDate)}</td></tr>` : ''}
        ${spec.poNumber ? `<tr><td>Your ref.</td><td>${esc(spec.poNumber)}</td></tr>` : ''}
      </table>
    </div>
    <h2>Invoice</h2>
    <table class="items">
      <tr><th>Description</th><th class="n">Quantity</th><th class="n">Unit price</th><th class="n">Net amount</th></tr>
      ${itemRows(spec)}
    </table>
    <table class="totals">${totalRows(spec)}</table>
    <div class="terms">${termsLine(spec)}${attackHtml(spec)}</div>
    <footer>
      <div>${esc(invoice.vendor.name)}<br>${lines(vendor.address)}</div>
      <div>Tel. ${esc(vendor.phone)}<br>${taxIdLine(spec)}</div>
      <div>${ibanLine(spec)}</div>
    </footer>`;
  return page(spec, css, body);
}
