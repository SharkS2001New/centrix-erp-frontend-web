import { saleLineProductLabel, saleLineQtyLabel } from "@/lib/sale-line-items";
import {
  formatReceiptNumber,
  formatSaleKes,
  saleCustomerLabel,
} from "@/lib/sales";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printSaleReceipt(
  sale,
  {
    organizationName = "POS / ERP",
    uomById = null,
    seller = null,
    branch = null,
      customer = null,
      productDiscountsEnabled = true,
      orderDiscountEnabled = false,
      customerNameEnabled = true,
      showBranchOnReceipt = true,
      kraReceipt = null,
  } = {}) {
  if (!sale) return;

  const items = sale.items ?? [];
  const receipt = formatReceiptNumber(sale);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const customerPhone =
    sale.customer_phone ?? sale.customer_mobile ?? customer?.phone_number ?? customer?.additional_phone ?? "—";
  const rawDate = sale.completed_at ?? sale.created_at;
  const date = rawDate
    ? new Date(rawDate).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
  const time = rawDate
    ? new Date(rawDate).toLocaleTimeString("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "—";

  const storeName = seller?.name ?? organizationName;
  const orgName = seller?.name ?? organizationName;
  const branchName = showBranchOnReceipt && branch?.name ? branch.name : null;
  const storeAddress = showBranchOnReceipt && branch?.address ? branch.address : seller?.address ?? "";
  const storePhones = showBranchOnReceipt && branch?.phone
    ? String(branch.phone)
    : [seller?.phone, seller?.secondary_phone].filter(Boolean).join(" / ");
  const tillNo = sale.branch_id ?? sale.pos_terminal_id ?? branch?.id ?? "1";

  function formatNumber(value) {
    return Number(value ?? 0).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const subtotalBeforeDiscount = items.reduce(
    (sum, line) => sum + Number(line.amount ?? 0) + Number(line.discount_given ?? 0),
    0,
  );
  const orderDiscount = items.reduce((sum, line) => sum + Number(line.discount_given ?? 0), 0);
  const subtotalAfterDiscount = items.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
  const vatAmount = Number(sale.total_vat ?? 0);
  const orderTotal = Number(sale.order_total ?? 0);
  const cashAmount = Number(sale.cash ?? 0);
  const mpesaAmount = Number(sale.mpesa_amount ?? 0);
  const equityAmount = Number(sale.equity_amount ?? 0);
  const kcbAmount = Number(sale.kcb_amount ?? 0);

  const paymentLines = [
    { label: "Cash amount", value: cashAmount },
    { label: "M-Pesa amount", value: mpesaAmount },
  ];
  if (Number.isFinite(kcbAmount)) {
    paymentLines.push({ label: "Bank amount (KCB Bank)", value: kcbAmount });
  }
  if (Number.isFinite(equityAmount) && equityAmount > 0) {
    paymentLines.push({ label: "Bank amount (Equity Bank)", value: equityAmount });
  }

  const hasOrderDiscount = Math.abs(orderDiscount) > 0.0001;
  const hasLineDiscount = items.some((l) => Math.abs(Number(l.discount_given ?? 0)) > 0.0001);
  const showLineDiscountColumn = Boolean(productDiscountsEnabled) && hasLineDiscount;
  const showDiscountTotals = hasOrderDiscount || Boolean(orderDiscountEnabled);

  const itemRows = items.length
    ? items
        .map((line) => {
          const qty = uomById ? saleLineQtyLabel(line, uomById) : String(line.quantity ?? "");
          const unitPrice = formatNumber(line.selling_price ?? line.unit_price ?? line.price ?? 0);
          const discount = formatNumber(line.discount_given ?? 0);
          const lineTotal = formatNumber(line.amount ?? 0);
          if (showLineDiscountColumn) {
            return `<tr>
            <td class="item">${escapeHtml(saleLineProductLabel(line))}</td>
            <td class="qty">${escapeHtml(qty)}</td>
            <td class="price">${escapeHtml(unitPrice)}</td>
            <td class="disc">${escapeHtml(discount)}</td>
            <td class="total">${escapeHtml(lineTotal)}</td>
          </tr>`;
          }
          return `<tr>
            <td class="item">${escapeHtml(saleLineProductLabel(line))}</td>
            <td class="qty">${escapeHtml(qty)}</td>
            <td class="price">${escapeHtml(unitPrice)}</td>
            <td class="total">${escapeHtml(lineTotal)}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="${showLineDiscountColumn ? 5 : 4}" class="muted center">No line items</td></tr>`;

  const paymentRows = paymentLines
    .map(
      (entry) => `<div class="payment-row"><span>${escapeHtml(entry.label)}</span><span>${escapeHtml(formatSaleKes(entry.value))}</span></div>`,
    )
    .join("");

  const totalPaid = cashAmount + mpesaAmount + equityAmount + kcbAmount;
  const changeAmount = Math.max(0, totalPaid - orderTotal);

  const kra = kraReceipt ?? sale?.kra_response ?? sale?.kraResponse ?? null;
  const kraBlock =
    kra?.receipt_signature || kra?.signature_link || kra?.invoice_number
      ? `<div class="divider"></div>
    <div class="kra-block" style="font-size:9px;text-align:center;line-height:1.4;">
      <div style="font-weight:700;margin-bottom:4px;">KRA FISCAL RECEIPT</div>
      ${kra.invoice_number ? `<div>CU Invoice: ${escapeHtml(String(kra.invoice_number))}</div>` : ""}
      ${kra.serial_number ? `<div>SCU: ${escapeHtml(String(kra.serial_number))}</div>` : ""}
      ${kra.receipt_signature ? `<div style="margin-top:4px;word-break:break-all;">${escapeHtml(String(kra.receipt_signature))}</div>` : ""}
      ${kra.kra_timestamp ? `<div>${escapeHtml(String(kra.kra_timestamp))}</div>` : ""}
    </div>`
      : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${escapeHtml(receipt)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 16px; color: #111827; background: #fff; }
    .receipt { width: 320px; margin: 0 auto; }
    .company-name { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: .06em; margin-bottom: 4px; }
    .company-meta { text-align: center; font-size: 10px; color: #475569; line-height: 1.4; }
    .till { text-align: center; font-size: 12px; margin: 10px 0 0; }
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
    .table td.item { padding-left: 4px; }
    .table td.price,
    .table td.disc,
    .table td.total { text-align: right; white-space: nowrap; }
    .totals { margin-top: 8px; font-size: 10px; }
    .totals-row { display: flex; justify-content: space-between; margin: 4px 0; }
    .totals-row span:first-child { color: #475569; }
    .totals-row.grand { font-size: 13px; font-weight: 700; color: #111827; margin-top: 8px; }
    .payment-summary { margin-top: 10px; }
    .payment-summary-label { display: inline-block; background: #111827; color: #fff; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; padding: 4px 8px; margin-bottom: 6px; }
    .payment-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 10px; }
    .thanks { text-align: center; margin: 12px 0 4px; font-size: 10px; color: #475569; }
    .barcode { margin-top: 6px; height: 40px; width: 100%; background-image: repeating-linear-gradient(90deg, #111827 0, #111827 2px, transparent 2px, transparent 6px); }
    .barcode-code { text-align: center; margin-top: 6px; font-size: 10px; letter-spacing: .14em; }
    @media print { body { padding: 0; } .receipt { margin: 0 auto; } }
  </style>
</head>
<body>
  <div class="receipt">
  <div class="company-name">${escapeHtml(orgName)}</div>
  ${branchName ? `<div class="company-meta">${escapeHtml(branchName)}</div>` : ""}
  ${storeAddress ? `<div class="company-meta">Address: ${escapeHtml(storeAddress)}</div>` : ""}
  ${storePhones ? `<div class="company-meta">TEL: ${escapeHtml(storePhones)}</div>` : ""}
  <div class="till">Till No: ${escapeHtml(String(tillNo))}</div>
    <div class="divider"></div>
    <div class="meta-grid">
      <div><span class="meta-label">Cash sales #:</span> ${escapeHtml(receipt)}</div>
      <div class="meta-value"><span class="meta-label">Date:</span> ${escapeHtml(date)}</div>
      <div><span class="meta-label">Customer name:</span> ${escapeHtml(customerName)}</div>
      <div class="meta-value"><span class="meta-label">Time:</span> ${escapeHtml(time)}</span></div>
      ${customerPhone && customerPhone !== "—" ? `<div class="meta-full"><span class="meta-label">Phone number:</span> ${escapeHtml(customerPhone)}</div>` : ""}
    </div>
    <div class="divider"></div>
    <table class="table">
      <thead>
        <tr>
          <th class="item">Item name</th>
          <th class="qty">Qty</th>
          <th class="price">Price</th>
          ${showLineDiscountColumn ? '<th class="disc">Disc</th>' : ''}
          <th class="total">Total</th>
      ${customerNameEnabled ? `<div><span class="meta-label">Customer name:</span> ${escapeHtml(customerName)}</div>` : ""}
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Subtotal</span><span>${escapeHtml(formatNumber(subtotalBeforeDiscount))}</span></div>
      ${showDiscountTotals ? `<div class="totals-row"><span>Discount</span><span>−${escapeHtml(formatNumber(orderDiscount))}</span></div>
      <div class="totals-row"><span>Subtotal after discount</span><span>${escapeHtml(formatNumber(subtotalAfterDiscount))}</span></div>` : ""}
      <div class="totals-row"><span>VAT (16%)</span><span>${escapeHtml(formatNumber(vatAmount))}</span></div>
      <div class="totals-row grand"><span>Total amount</span><span>${escapeHtml(formatSaleKes(orderTotal))}</span></div>
    </div>
    <div class="payment-summary">
      <div class="payment-summary-label">Payment summary</div>
      ${paymentRows}
      <div class="payment-row"><span><strong>Total paid</strong></span><span><strong>${escapeHtml(formatSaleKes(totalPaid))}</strong></span></div>
      <div class="payment-row"><span><strong>Change</strong></span><span><strong>${escapeHtml(formatSaleKes(changeAmount))}</strong></span></div>
    </div>
    ${kraBlock}
    <div class="thanks">Thank you for shopping with us!</div>
    <div class="thanks">Goods once sold are not returnable.</div>
    <div class="barcode"></div>
    <div class="barcode-code">${escapeHtml(receipt)}</div>
  </div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
