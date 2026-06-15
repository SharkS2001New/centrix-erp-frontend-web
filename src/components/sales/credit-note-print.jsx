import { customerReturnLineQtyLabel } from "@/components/sales/customer-returns-shared";
import { openPrintWindow } from "@/lib/open-print-window";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KRA_REFUND_REASONS = {
  "01": "Missing Quantity",
  "02": "Missing Data",
  "03": "Damaged / Wasted",
  "04": "Raw Material",
  "05": "Shortage",
  "06": "Refund",
};

export function printCreditNote(
  customerReturn,
  {
    organizationName = "POS / ERP",
    branch = null,
    uomById = null,
  } = {},
) {
  if (!customerReturn) return;

  const creditNote = customerReturn.credit_note ?? customerReturn.creditNote ?? null;
  const lines = customerReturn.lines ?? [];
  const sale = customerReturn.sale ?? null;
  const customerName =
    customerReturn.customer?.customer_name ?? sale?.customer_name_override ?? "Walk-in customer";
  const creditNo = creditNote?.credit_note_no ?? customerReturn.return_no ?? "Credit note";
  const originalInvoice = sale ? formatReceiptNumber(sale) : "—";
  const creditDate = creditNote?.credit_date ?? customerReturn.return_date;
  const dateLabel = creditDate
    ? new Date(creditDate).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  const branchName = branch?.name ?? null;
  const branchAddress = branch?.address ?? "";
  const branchPhone = branch?.phone ? String(branch.phone) : "";

  const itemRows = lines.length
    ? lines
        .map((line) => {
          const qty = customerReturnLineQtyLabel(line, uomById, "return_qty");
          const unitPrice = Number(line.unit_price ?? 0).toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const amount = formatSaleKes(line.amount);
          return `<tr>
            <td class="item">${escapeHtml(line.product_name ?? line.product_code)}</td>
            <td class="qty">${escapeHtml(qty)}</td>
            <td class="price">${escapeHtml(unitPrice)}</td>
            <td class="total">${escapeHtml(amount)}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="muted center">No returned items</td></tr>`;

  const kra =
    creditNote?.kra_status === "success"
      ? {
          invoice_number: creditNote.kra_cu_inv_no ?? creditNote.kra_invoice_number,
          receipt_signature: creditNote.kra_receipt_signature,
          signature_link: creditNote.kra_signature_link,
          serial_number: creditNote.kra_serial_number,
          kra_timestamp: creditNote.kra_timestamp,
        }
      : null;

  const kraBlock =
    kra?.receipt_signature || kra?.invoice_number
      ? `<div class="divider"></div>
    <div class="kra-block" style="font-size:9px;text-align:center;line-height:1.4;">
      <div style="font-weight:700;margin-bottom:4px;">KRA FISCAL CREDIT NOTE</div>
      ${kra.invoice_number ? `<div>CU Credit Note: ${escapeHtml(String(kra.invoice_number))}</div>` : ""}
      ${creditNote?.kra_relevant_invoice_number ? `<div>Original CU Invoice: ${escapeHtml(String(creditNote.kra_relevant_invoice_number))}</div>` : ""}
      ${kra.serial_number ? `<div>SCU: ${escapeHtml(String(kra.serial_number))}</div>` : ""}
      ${kra.receipt_signature ? `<div style="margin-top:4px;word-break:break-all;">${escapeHtml(String(kra.receipt_signature))}</div>` : ""}
      ${kra.kra_timestamp ? `<div>${escapeHtml(String(kra.kra_timestamp))}</div>` : ""}
    </div>`
      : "";

  const refundReasonCode = creditNote?.kra_refund_reason_code ?? "";
  const refundReasonLabel =
    KRA_REFUND_REASONS[refundReasonCode] ?? customerReturn.reason ?? "Customer return";

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Credit Note ${escapeHtml(creditNo)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 16px; color: #111827; background: #fff; }
    .receipt { width: 320px; margin: 0 auto; }
    .company-name { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: .06em; margin-bottom: 4px; }
    .company-meta { text-align: center; font-size: 10px; color: #475569; line-height: 1.4; }
    .doc-title { text-align: center; font-size: 13px; font-weight: 700; margin: 10px 0 0; letter-spacing: .08em; }
    .divider { border-top: 1px dashed #475569; margin: 10px 0; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px; line-height: 1.4; }
    .meta-label { font-weight: 700; letter-spacing: .05em; }
    .meta-value { text-align: right; }
    .meta-full { grid-column: 1 / -1; }
    .table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px; }
    .table thead th { text-align: left; padding: 6px 0 4px; border-bottom: 1px solid #111827; font-weight: 700; }
    .table tbody tr { border-top: 1px dashed #cbd5e1; }
    .table td { padding: 6px 0; vertical-align: top; }
    .table td.qty { width: 2.5rem; text-align: center; }
    .table td.price, .table td.total { text-align: right; white-space: nowrap; }
    .totals { margin-top: 8px; font-size: 10px; }
    .totals-row { display: flex; justify-content: space-between; margin: 4px 0; }
    .totals-row.grand { font-size: 13px; font-weight: 700; margin-top: 8px; }
    .thanks { text-align: center; margin: 12px 0 4px; font-size: 10px; color: #475569; }
    @media print { body { padding: 0; } .receipt { margin: 0 auto; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="company-name">${escapeHtml(organizationName)}</div>
    ${branchName ? `<div class="company-meta">${escapeHtml(branchName)}</div>` : ""}
    ${branchAddress ? `<div class="company-meta">Address: ${escapeHtml(branchAddress)}</div>` : ""}
    ${branchPhone ? `<div class="company-meta">TEL: ${escapeHtml(branchPhone)}</div>` : ""}
    <div class="doc-title">CREDIT NOTE</div>
    <div class="divider"></div>
    <div class="meta-grid">
      <div><span class="meta-label">Credit note #:</span> ${escapeHtml(creditNo)}</div>
      <div class="meta-value"><span class="meta-label">Date:</span> ${escapeHtml(dateLabel)}</div>
      <div class="meta-full"><span class="meta-label">Original invoice:</span> ${escapeHtml(originalInvoice)}</div>
      <div class="meta-full"><span class="meta-label">Customer:</span> ${escapeHtml(customerName)}</div>
      <div class="meta-full"><span class="meta-label">Return ref:</span> ${escapeHtml(customerReturn.return_no ?? "—")}</div>
      <div class="meta-full"><span class="meta-label">Reason:</span> ${escapeHtml(refundReasonLabel)}</div>
    </div>
    <div class="divider"></div>
    <table class="table">
      <thead>
        <tr>
          <th class="item">Returned item</th>
          <th class="qty">Qty</th>
          <th class="price">Price</th>
          <th class="total">Credit</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row grand"><span>Total credit</span><span>${escapeHtml(formatSaleKes(customerReturn.total_amount))}</span></div>
      <div class="totals-row"><span>Refund method</span><span>${escapeHtml(customerReturn.refund_method ?? "CASH")}</span></div>
    </div>
    ${kraBlock}
    <div class="thanks">This credit note is issued against the original sale listed above.</div>
  </div>
</body>
</html>`;

  openPrintWindow(html, "width=420,height=640");
}
