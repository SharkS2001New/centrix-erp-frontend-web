import {
  saleLineDisplayUnitPrice,
  saleLineProductLabel,
  saleLineQtyLabel,
} from "@/lib/sale-line-items";
import { buildReportOrgHeaderHtml, resolveReportBranding } from "@/lib/reports/report-branding";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatPrintAmount(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Line Disc column — only when discounts are enabled in sales settings. */
export function shouldShowPrintDiscountColumn({ allowDiscounts = false } = {}) {
  return Boolean(allowDiscounts);
}

export function resolveSaleDocumentBranding({ organization = null, generalSettings = null } = {}) {
  return resolveReportBranding({ organization, generalSettings });
}

export function buildSaleDocumentOrgHeaderHtml(branding, { layout = "thermal" } = {}) {
  if (!branding?.showHeader) return "";

  const header = buildReportOrgHeaderHtml(branding);
  if (!header) return "";

  if (layout === "thermal") {
    return `<div class="org-brand" style="text-align:center;margin-bottom:8px;">
      ${header.replace('class="org-name"', 'class="org-name" style="font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;"')}
    </div>`;
  }

  return `<div class="org-brand" style="text-align:center;margin-bottom:10px;">${header}</div>`;
}

export function buildSaleDocumentTableHead({ showDiscountColumn = false, layout = "thermal" } = {}) {
  if (layout === "thermal") {
    return `<tr>
      <th class="qty">QTY</th>
      <th class="desc">Description</th>
      <th class="price">Unit price</th>
      ${showDiscountColumn ? '<th class="disc">Disc</th>' : ""}
      <th class="amount">Amount</th>
    </tr>`;
  }

  return `<tr>
    <th>Description</th>
    <th class="num">QTY</th>
    <th class="num">Unit price</th>
    ${showDiscountColumn ? '<th class="num">Disc</th>' : ""}
    <th class="num">Amount</th>
  </tr>`;
}

export function buildSaleDocumentLineRows(
  items,
  { uomById = null, showDiscountColumn = false, layout = "thermal" } = {},
) {
  const rows = items ?? [];
  const colspan = showDiscountColumn ? 5 : 4;

  if (!rows.length) {
    return `<tr><td colspan="${colspan}" class="muted center">No line items</td></tr>`;
  }

  return rows
    .map((line) => {
      const description = escapeHtml(saleLineProductLabel(line));
      const qty = escapeHtml(
        uomById ? saleLineQtyLabel(line, uomById) : formatPrintAmount(line.quantity),
      );
      const unitPrice = escapeHtml(
        formatPrintAmount(
          uomById
            ? saleLineDisplayUnitPrice(line, uomById)
            : (line.selling_price ?? line.unit_price ?? line.price ?? 0),
        ),
      );
      const discount = escapeHtml(formatPrintAmount(line.discount_given ?? 0));
      const amount = escapeHtml(formatPrintAmount(line.amount ?? 0));

      if (layout === "thermal") {
        if (showDiscountColumn) {
          return `<tr>
            <td class="qty">${qty}</td>
            <td class="desc">${description}</td>
            <td class="price">${unitPrice}</td>
            <td class="disc">${discount}</td>
            <td class="amount">${amount}</td>
          </tr>`;
        }
        return `<tr>
          <td class="qty">${qty}</td>
          <td class="desc">${description}</td>
          <td class="price">${unitPrice}</td>
          <td class="amount">${amount}</td>
        </tr>`;
      }

      if (showDiscountColumn) {
        return `<tr>
          <td>${description}</td>
          <td class="num">${qty}</td>
          <td class="num">${unitPrice}</td>
          <td class="num">${discount}</td>
          <td class="num">${amount}</td>
        </tr>`;
      }

      return `<tr>
        <td>${description}</td>
        <td class="num">${qty}</td>
        <td class="num">${unitPrice}</td>
        <td class="num">${amount}</td>
      </tr>`;
    })
    .join("");
}

export function saleDocumentDiscountTotals({
  items = [],
  sale = {},
  orderDiscountEnabled = false,
}) {
  const lineDiscountTotal = items.reduce(
    (sum, line) => sum + Number(line.discount_given ?? 0),
    0,
  );
  const orderDiscount = Number(sale.order_discount ?? 0);
  const subtotalBeforeDiscount = items.reduce(
    (sum, line) => sum + Number(line.amount ?? 0) + Number(line.discount_given ?? 0),
    0,
  );
  const subtotalAfterLineDiscount = items.reduce(
    (sum, line) => sum + Number(line.amount ?? 0),
    0,
  );
  const subtotalAfterAllDiscounts = subtotalAfterLineDiscount - orderDiscount;
  const showLineDiscountRow = lineDiscountTotal > 0.0001;
  const showOrderDiscountRow = orderDiscountEnabled && orderDiscount > 0.0001;
  const showDiscountSection = showLineDiscountRow || showOrderDiscountRow;

  return {
    lineDiscountTotal,
    orderDiscount,
    subtotalBeforeDiscount,
    subtotalAfterLineDiscount,
    subtotalAfterAllDiscounts,
    showLineDiscountRow,
    showOrderDiscountRow,
    showDiscountSection,
  };
}
