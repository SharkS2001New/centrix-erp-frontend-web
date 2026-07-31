import {
  resolveSaleLinePrintColumns,
  saleLinePrintQtyPackage,
  saleLineProductLabel,
  saleLineQtyLabel,
  saleLineUom,
} from "@/lib/sale-line-items";
import { buildReportOrgHeaderHtml, resolveReportBranding } from "@/lib/reports/report-branding";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";
import { resolveDocumentPrintPhonesLine } from "@/lib/document-print-phones";

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

export function formatPrintAmount(value, { decimals = 2 } = {}) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const normalized = decimals === 0 ? Math.round(num) : num;
  return normalized.toLocaleString("en-KE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Thermal receipt — whole shillings without .00 (matches classic roll printers). */
export function formatThermalPrintAmount(value) {
  return formatPrintAmount(value, { decimals: 0 });
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
  documentVariant = null,
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings, organizationNameFallback });
  if (!documentVariant) return branding;
  return brandingWithDocumentLogo(branding, generalSettings, documentVariant);
}

/**
 * Store contact lines for thermal receipts and A4 sales invoices / proformas.
 * Phones: thermal always uses company Tel 1/2; invoice/proforma may use dedicated print phones.
 * When branch details are enabled and the branch has a phone, that overrides for sales docs.
 */
export function resolveSaleDocumentStoreContact({
  showBranchOnReceipt,
  branch,
  seller,
  organization = null,
  documentType = "receipt",
  salesSettings = null,
  moduleSettings = null,
} = {}) {
  const org =
    organization ??
    (seller
      ? {
          primary_tel: seller.phone,
          secondary_tel: seller.secondary_phone,
          org_address: seller.address,
        }
      : null);

  const resolvedPhones = resolveDocumentPrintPhonesLine({
    documentType,
    organization: org,
    salesSettings: salesSettings ?? moduleSettings?.sales ?? null,
    moduleSettings,
  });
  const fallbackPhones = [seller?.phone, seller?.secondary_phone].filter(Boolean).join(" / ");
  const storePhones = resolvedPhones || fallbackPhones;

  if (!showBranchOnReceipt) {
    return {
      branchName: null,
      storeAddress: seller?.address ?? "",
      storePhones,
    };
  }

  return {
    branchName: branch?.name ?? null,
    storeAddress: branch?.address ?? seller?.address ?? "",
    storePhones: branch?.phone ? String(branch.phone) : storePhones,
  };
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function personNameFromSaleUserRecord(user) {
  if (!user || typeof user !== "object") return null;
  // Prefer display name for "You were served by"; fall back to login username.
  return firstNonEmptyString(
    user.full_name,
    user.name,
    user.display_name,
    user.username,
    user.login,
    user.user_name,
  );
}

/**
 * Name of the user who created / cashiered the sale for receipt "You were served by".
 * Prefer sale creator fields over the current session user (reprints must not show the reprinting login).
 */
export function resolveSaleOrderCreatorName(sale, preparedBy = null) {
  if (sale) {
    const fromSale = firstNonEmptyString(
      sale.created_by_name,
      sale.cashier_name,
      sale.placed_by_name,
      personNameFromSaleUserRecord(sale.created_by_user),
      personNameFromSaleUserRecord(sale.cashier_user),
      personNameFromSaleUserRecord(sale.cashier),
      personNameFromSaleUserRecord(sale.user),
      sale.created_by_username,
      sale.cashier_username,
      sale.placed_by_username,
      typeof sale.created_by === "string" ? sale.created_by : null,
    );
    if (fromSale) return fromSale;
  }

  if (typeof preparedBy === "string" && preparedBy.trim()) {
    return preparedBy.trim();
  }
  if (preparedBy && typeof preparedBy === "object") {
    return personNameFromSaleUserRecord(preparedBy) ?? "—";
  }

  return "—";
}

export function buildSaleDocumentOrgHeaderHtml(
  branding,
  { layout = "thermal", fallbackName = "", logoLayout = null } = {},
) {
  if (!branding?.showHeader) return "";

  const header = buildReportOrgHeaderHtml(branding, {
    layout,
    logoLayout: logoLayout ?? branding.logoLayout ?? null,
  });
  if (header?.trim()) {
    if (layout === "thermal") {
      // Font size comes from receipt CSS (.org-name / .company-name) so org print settings apply.
      return `<div class="org-brand" style="text-align:center;margin-bottom:3px;">${header}</div>`;
    }
    return `<div class="org-brand" style="text-align:center;margin-bottom:10px;">${header}</div>`;
  }

  const name = String(branding.organizationName ?? fallbackName ?? "").trim();
  if (!name) return "";

  if (layout === "thermal") {
    return `<div class="org-brand" style="text-align:center;margin-bottom:3px;"><div class="company-name">${escapeHtml(name)}</div></div>`;
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
          ? `${escapeHtml(quantity)} ${escapeHtml(packageLabel)}`
          : escapeHtml(quantity);

        if (showDiscountColumn) {
          return `<tr>
          <td class="desc">${description}</td>
          <td class="qty">${qtyCell}</td>
          <td class="price">${escapeHtml(formatThermalPrintAmount(unitPrice))}</td>
          <td class="disc">${escapeHtml(formatThermalPrintAmount(discount))}</td>
          <td class="amount">${escapeHtml(formatThermalPrintAmount(amount))}</td>
        </tr>`;
        }

        return `<tr>
          <td class="desc">${description}</td>
          <td class="qty">${qtyCell}</td>
          <td class="price">${escapeHtml(formatThermalPrintAmount(unitPrice))}</td>
          <td class="amount">${escapeHtml(formatThermalPrintAmount(amount))}</td>
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
