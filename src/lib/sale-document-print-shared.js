import {
  resolveSaleLinePrintColumns,
  saleLinePrintQtyPackage,
  saleLineProductLabel,
  saleLineQtyLabel,
  saleLineUom,
} from "@/lib/sale-line-items";
import { buildReportOrgHeaderHtml, resolveReportBranding } from "@/lib/reports/report-branding";

/** Mirrors orgSalesDiscountFeaturesActive in sales-settings (inline to keep print path self-contained). */
function discountFeaturesEnabledForPrint(moduleSettings) {
  const sales = moduleSettings?.sales ?? moduleSettings ?? {};
  const s = sales && typeof sales === "object" ? sales : {};
  return Boolean(
    s.allow_discounts ||
      s.effective_allow_discounts ||
      s.allow_edit_line_discount ||
      s.allow_pos_edit_line_discount ||
      s.discount_approval_enabled ||
      s.discount_approval_enabled_mobile ||
      s.discount_approval_enabled_backoffice ||
      s.enable_order_discount ||
      s.effective_enable_order_discount,
  );
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Coerce print field values — nested objects must never become "[object Object]". */
export function stringifyPrintField(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    for (const key of ["full_name", "name", "username", "label", "value", "text", "title"]) {
      if (value[key] != null && value[key] !== value) {
        const nested = stringifyPrintField(value[key]);
        if (nested) return nested;
      }
    }
    return "";
  }
  return String(value).trim();
}

export function formatPrintAmount(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Line Disc column — only when discounts are enabled in sales settings. */
export function shouldShowPrintDiscountColumn({
  allowDiscounts = false,
  moduleSettings = null,
} = {}) {
  if (moduleSettings) {
    return discountFeaturesEnabledForPrint(moduleSettings);
  }
  return Boolean(allowDiscounts);
}

export function resolveSaleDocumentBranding({
  organization = null,
  generalSettings = null,
  organizationNameFallback = "",
} = {}) {
  return resolveReportBranding({ organization, generalSettings, organizationNameFallback });
}

/**
 * Store contact lines for thermal receipts and A4 sales invoices.
 * When branch details are enabled, prefers the order branch; missing branch fields fall back to organization.
 */
export function resolveSaleDocumentStoreContact({ showBranchOnReceipt, branch, seller }) {
  if (!showBranchOnReceipt) {
    return {
      branchName: null,
      storeAddress: seller?.address ?? "",
      storePhones: [seller?.phone, seller?.secondary_phone].filter(Boolean).join(" / "),
    };
  }

  return {
    branchName: branch?.name ?? null,
    storeAddress: branch?.address ?? seller?.address ?? "",
    storePhones: branch?.phone
      ? String(branch.phone)
      : [seller?.phone, seller?.secondary_phone].filter(Boolean).join(" / "),
  };
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function usernameFromSaleUserRecord(user) {
  if (!user || typeof user !== "object") return null;
  // Receipt "You were served by" uses login username, not display/full name.
  return firstNonEmptyString(user.username, user.login, user.user_name);
}

/** Login username for receipt/invoice "You were served by" (not full name). */
export function resolveSaleOrderCreatorName(sale, preparedBy = null) {
  const explicit = typeof preparedBy === "string" ? preparedBy.trim() : "";
  if (explicit) return explicit;
  if (!sale) return "—";

  return (
    firstNonEmptyString(
      sale.created_by_username,
      sale.cashier_username,
      sale.placed_by_username,
      usernameFromSaleUserRecord(sale.created_by_user),
      usernameFromSaleUserRecord(sale.cashier_user),
      usernameFromSaleUserRecord(sale.cashier),
      usernameFromSaleUserRecord(sale.user),
      typeof sale.created_by === "string" ? sale.created_by : null,
      // Legacy fields may store display names — only used when username is unavailable.
      sale.created_by_name,
      sale.cashier_name,
      sale.placed_by_name,
    ) ?? "—"
  );
}

export function buildSaleDocumentOrgHeaderHtml(
  branding,
  { layout = "thermal", fallbackName = "" } = {},
) {
  if (!branding?.showHeader) return "";

  const header = buildReportOrgHeaderHtml(branding);
  if (header?.trim()) {
    if (layout === "thermal") {
      // Font size comes from receipt CSS (.org-name / .company-name) so org print settings apply.
      return `<div class="org-brand" style="text-align:center;margin-bottom:8px;">${header}</div>`;
    }
    return `<div class="org-brand" style="text-align:center;margin-bottom:10px;">${header}</div>`;
  }

  const name = String(branding.organizationName ?? fallbackName ?? "").trim();
  if (!name) return "";

  if (layout === "thermal") {
    return `<div class="org-brand" style="text-align:center;margin-bottom:8px;"><div class="company-name">${escapeHtml(name)}</div></div>`;
  }

  return `<div class="org-brand" style="text-align:center;margin-bottom:10px;"><div class="brand-name">${escapeHtml(name)}</div></div>`;
}

export function buildSaleDocumentTableHead({ showDiscountColumn = false, layout = "thermal" } = {}) {
  if (layout === "thermal") {
    if (showDiscountColumn) {
      return `<tr>
      <th class="desc">ITEMS</th>
      <th class="qty">QTY</th>
      <th class="price">PRICE</th>
      <th class="disc">Disc</th>
      <th class="amount">AMOUNT</th>
    </tr>`;
    }
    return `<tr>
      <th class="desc">ITEMS</th>
      <th class="qty">QTY</th>
      <th class="price">PRICE</th>
      <th class="amount">AMOUNT</th>
    </tr>`;
  }

  if (layout === "a4") {
    return `<tr>
      <th>Items</th>
      <th class="num">Quantity</th>
      <th class="num">Price</th>
      ${showDiscountColumn ? '<th class="num">Discount</th>' : ""}
      <th class="num">Amount</th>
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
  { uomById = null, showDiscountColumn = false, layout = "thermal", legacyPrint = false } = {},
) {
  const rows = items ?? [];
  const colspan =
    layout === "thermal" ? (showDiscountColumn ? 5 : 4) : showDiscountColumn ? 5 : 4;

  if (!rows.length) {
    return `<tr><td colspan="${colspan}" class="muted center">No line items</td></tr>`;
  }

  return rows
    .map((line) => {
      const description = escapeHtml(saleLineProductLabel(line));
      const uom = legacyPrint ? null : saleLineUom(line, uomById);
      const linePrintOptions = { legacyPrint };

      if (layout === "thermal") {
        const { unitPrice, discount, amount } = resolveSaleLinePrintColumns(line, {
          uom,
          legacyPrint,
        });
        const { quantity, package: packageLabel } = saleLinePrintQtyPackage(
          line,
          uomById,
          linePrintOptions,
        );
        const qtyCell = packageLabel
          ? `<span class="qty-val">${escapeHtml(quantity)}</span><span class="qty-pkg">${escapeHtml(packageLabel)}</span>`
          : escapeHtml(quantity);

        if (showDiscountColumn) {
          return `<tr>
          <td class="desc">${description}</td>
          <td class="qty">${qtyCell}</td>
          <td class="price">${escapeHtml(formatPrintAmount(unitPrice))}</td>
          <td class="disc">${escapeHtml(formatPrintAmount(discount))}</td>
          <td class="amount">${escapeHtml(formatPrintAmount(amount))}</td>
        </tr>`;
        }

        return `<tr>
          <td class="desc">${description}</td>
          <td class="qty">${qtyCell}</td>
          <td class="price">${escapeHtml(formatPrintAmount(unitPrice))}</td>
          <td class="amount">${escapeHtml(formatPrintAmount(amount))}</td>
        </tr>`;
      }

      const qty = escapeHtml(
        legacyPrint || uomById
          ? saleLineQtyLabel(line, uomById, linePrintOptions)
          : formatPrintAmount(line.quantity),
      );
      const unitPrice = escapeHtml(
        formatPrintAmount(
          legacyPrint || uom
            ? resolveSaleLinePrintColumns(line, { uom, legacyPrint }).unitPrice
            : (line.selling_price ?? line.unit_price ?? line.price ?? 0),
        ),
      );
      const discount = escapeHtml(formatPrintAmount(line.discount_given ?? 0));
      const amount = escapeHtml(formatPrintAmount(line.amount ?? 0));

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
