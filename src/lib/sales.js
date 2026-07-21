import { humanizeBackendTerm, salesChannelLabel } from "@/lib/user-facing-labels";
import { formatOrgCurrency } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import { getSaleTimestamp, isSameCalendarDay, formatAppDateTime } from "@/lib/datetime";
import { isExternalPosEnabled } from "@/lib/nav-feature-gates";
import {
  DEFAULT_ORDER_WORKFLOW,
  alignStatusToWorkflow,
  saleMatchesConfiguredActionStages,
  nextTransitionOptions as workflowNextTransitions,
  pipelineStepIndex as workflowPipelineIndex,
  workflowPipelineSteps,
  workflowStatusLabel,
  workflowTransitions,
} from "@/lib/order-workflow";
import {
  resolveEditOrderStatuses,
  salesSettingsFromCapabilities,
} from "@/lib/sales-settings";

export const SALE_STATUS_LABELS = Object.fromEntries(
  DEFAULT_ORDER_WORKFLOW.steps.map((s) => [s.status, s.label]),
);
SALE_STATUS_LABELS.draft = "Draft";
SALE_STATUS_LABELS.held = "Held";
SALE_STATUS_LABELS.cancelled = "Cancelled";
SALE_STATUS_LABELS.expired = "Expired";

export const PAYMENT_STATUS_LABELS = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
};

/** Which client system created the order (audit). */
export const ORDER_SOURCE_LABELS = {
  pos: "Point of sale",
  mobile: "Mobile",
  backoffice: "Backoffice",
  backend: "Backoffice",
  whatsapp: "WhatsApp",
};

const BACKOFFICE_SOURCE_KEYS = new Set(["pos", "backend", "backoffice", "erp"]);

/** Normalize API source/channel keys for display and filters. */
export function resolveOrderSourceKey(source, fallbackChannel, capabilities = null) {
  const raw = String(source ?? fallbackChannel ?? "").toLowerCase();
  if (!raw) return "backoffice";

  if (capabilities && !isExternalPosEnabled(capabilities) && BACKOFFICE_SOURCE_KEYS.has(raw)) {
    return "backoffice";
  }

  if (raw === "backend" || raw === "erp") return "backoffice";
  return raw;
}

export function orderSourceLabel(source, fallbackChannel, capabilities = null) {
  const key = resolveOrderSourceKey(source, fallbackChannel, capabilities);
  if (ORDER_SOURCE_LABELS[key]) return ORDER_SOURCE_LABELS[key];
  return salesChannelLabel(key) ?? humanizeBackendTerm(key) ?? key ?? "—";
}

/** Mobile field sales or POS route-order mode (route assigned, channel mobile|pos). */
export function isRouteOrderSale(sale) {
  if (!sale?.route_id) return false;
  const channel = String(sale.channel ?? sale.order_source ?? "").toLowerCase();
  return channel === "mobile" || channel === "pos";
}

/** Mobile field-sales channel (Mobile Orders list), not a workflow status. */
export function isMobileChannelSale(sale, capabilities = null) {
  if (!sale) return false;
  const sourceKey = resolveOrderSourceKey(sale.order_source, sale.channel, capabilities);
  if (sourceKey === "mobile") return true;
  return String(sale.channel ?? "").toLowerCase() === "mobile";
}

/**
 * True when the order's workflow stage is in `allowed`, or when `mobile` is allowed
 * and the order is from the mobile channel (Mobile Orders page).
 */
export function orderMatchesActionStages(sale, allowedList, workflow = null, capabilities = null) {
  void capabilities;
  return saleMatchesConfiguredActionStages(sale, allowedList, workflow);
}

/** Show Edit Order when workflow status is in the tenant's configured edit stages. */
export function isOrderEditVisible(sale, workflow = null, capabilities = null) {
  if (!sale) return false;
  const raw = String(sale.status ?? "").toLowerCase();
  if (raw === "cancelled" || raw === "expired") return false;
  return orderMatchesActionStages(
    sale,
    resolveEditOrderStatuses(salesSettingsFromCapabilities(capabilities)),
    workflow,
    capabilities,
  );
}

export function isBackofficeSale(sale, capabilities = null) {
  if (String(sale?.status ?? "").toLowerCase() === "editable") return true;

  const meta = sale?.fulfillment_meta;
  if (meta?.sales_workspace === "backoffice") return true;

  const sourceKey = resolveOrderSourceKey(sale?.order_source, sale?.channel, capabilities);
  if (sourceKey === "backoffice") return true;

  const channel = String(sale?.channel ?? "").toLowerCase();
  return channel === "backend" || channel === "backoffice" || channel === "erp" || channel === "whatsapp";
}

export function isPosOrMobileSale(sale, capabilities = null) {
  if (isBackofficeSale(sale, capabilities)) return false;

  const sourceKey = resolveOrderSourceKey(sale?.order_source, sale?.channel, capabilities);
  return sourceKey === "pos" || sourceKey === "mobile";
}

/** Line-edit popup for workspace orders (backoffice, mobile, editable discount revision). */
export function shouldOpenBackofficeOrderEdit(sale, workflow = null, capabilities = null) {
  if (sale?.can_edit_lines) return true;
  if (String(sale?.status ?? "").toLowerCase() === "editable") return true;

  const sourceKey = resolveOrderSourceKey(sale?.order_source, sale?.channel, capabilities);
  if (sourceKey === "mobile" && (isOrderEditVisible(sale, workflow, capabilities) || sale?.can_edit)) {
    return true;
  }

  if (isBackofficeSale(sale, capabilities) && (isOrderEditVisible(sale, workflow, capabilities) || sale?.can_edit)) {
    return true;
  }

  if (!isOrderEditVisible(sale, workflow, capabilities)) return false;
  return !isPosOrMobileSale(sale, capabilities);
}

export function shouldRestoreOrderToCart(sale, workflow = null, capabilities = null) {
  if (shouldOpenBackofficeOrderEdit(sale, workflow, capabilities)) return false;
  if (sale?.can_edit_lines) return false;
  if (sale?.can_edit === false) return false;
  if (isBackofficeSale(sale, capabilities)) return false;
  if (!isOrderEditVisible(sale, workflow, capabilities) && !sale?.can_edit) return false;
  return isPosOrMobileSale(sale, capabilities) || Boolean(sale?.can_edit);
}

/** Whether the Edit Order action should appear in list/detail menus. */
export function isOrderEditActionVisible(sale, workflow = null, capabilities = null) {
  if (!sale) return false;
  return (
    shouldOpenBackofficeOrderEdit(sale, workflow, capabilities)
    || shouldRestoreOrderToCart(sale, workflow, capabilities)
  );
}

/** Visual pipeline steps for backend/mobile orders. */
export const ORDER_PIPELINE_STEPS = workflowPipelineSteps();

/** Allowed transitions (mirrors OrderWorkflowController). */
export const SALE_TRANSITIONS = workflowTransitions();

export function formatSaleKes(value, settings = GENERAL_DEFAULTS) {
  if (value == null || value === "") return "—";
  return formatOrgCurrency(value, settings);
}

export function formatOrderNumber(saleOrNum) {
  if (saleOrNum == null || saleOrNum === "") return "—";
  if (typeof saleOrNum === "object") {
    const num = saleOrNum.order_num ?? saleOrNum.id;
    if (num == null || num === "") {
      const legacyLabel =
        saleOrNum.fulfillment_meta?.legacy_order_label ?? saleOrNum.legacy_order_label;
      if (legacyLabel) return legacyLabel;
      return "—";
    }
    return `S${String(num).padStart(4, "0")}`;
  }
  return `S${String(saleOrNum).padStart(4, "0")}`;
}

/**
 * Parse display order # (S0034, s34, #34) to the numeric order_num, or null.
 */
export function parseOrderNumberQuery(query) {
  const q = String(query ?? "").trim().replace(/^#+/, "");
  if (!q) return null;

  const sMatch = q.match(/^S0*(\d+)$/i);
  if (sMatch) return Number(sMatch[1]);

  if (/^\d+$/.test(q)) return Number(q);

  return null;
}

/** Normalize list search so S0034 reaches the API as the order number digits. */
export function normalizeSalesListSearchQuery(query) {
  const q = String(query ?? "").trim();
  if (!q) return "";
  const stripped = q.replace(/^#+/, "");
  const orderNum = parseOrderNumberQuery(stripped);
  if (orderNum != null && /^S/i.test(stripped)) {
    return String(orderNum);
  }
  return q;
}

/** Order number and receipt number are the same formatted value (S + padded order_num). */
export function formatReceiptNumber(sale) {
  return formatOrderNumber(sale);
}

/** When the order was first placed (booked), not when it was completed/paid. */
export function salePlacedAt(sale) {
  return sale?.created_at ?? sale?.completed_at ?? null;
}

export function formatSalePlacedDateTime(valueOrSale) {
  const value =
    valueOrSale != null && typeof valueOrSale === "object"
      ? salePlacedAt(valueOrSale)
      : valueOrSale;
  return formatAppDateTime(value);
}

/** Original legacy order total (before returns zero out the live sale total). */
export function legacyOrderDisplayTotal(row) {
  const summary = row?.legacy_return_summary;
  if (summary?.original_order_total != null && summary.original_order_total !== "") {
    const fromSummary = Number(summary.original_order_total);
    if (Number.isFinite(fromSummary)) return fromSummary;
  }

  const meta = row?.fulfillment_meta ?? {};
  if (meta.legacy_order_total != null && meta.legacy_order_total !== "") {
    const fromMeta = Number(meta.legacy_order_total);
    if (Number.isFinite(fromMeta)) return fromMeta;
  }

  const returned = Number(summary?.returned_total ?? 0);
  const current = Number(row?.order_total ?? 0);
  if (returned > 0) return returned + current;

  return current;
}

export function saleCustomerLabel(sale) {
  if (!sale) return "Walk-in";
  // Registered customers: prefer the org-scoped relation. customer_num is only
  // unique within an organization — never trust a stale override from another org.
  if (sale.customer_num) {
    const relatedName = sale.customer?.customer_name?.trim();
    if (relatedName) return relatedName;
    const display = sale.customer_display_name?.trim();
    if (display) return display;
  }
  const override = sale.customer_name_override?.trim();
  if (override) return override;
  const flatName = sale.customer_name?.trim();
  if (flatName) return flatName;
  if (sale.customer_num) return `Customer #${sale.customer_num}`;
  return "Walk-in";
}

export function isSaleToday(sale, reference = new Date()) {
  const ts = getSaleTimestamp(sale);
  return ts ? isSameCalendarDay(ts, reference) : false;
}

export function filterSalesByPeriod(sales, period = "day", reference = new Date()) {
  return (sales ?? []).filter((sale) => {
    const ts = getSaleTimestamp(sale);
    if (!ts) return false;
    if (period === "day") return isSameCalendarDay(ts, reference);
    if (period === "week") {
      const start = new Date(reference);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(reference);
      end.setHours(23, 59, 59, 999);
      return ts >= start && ts <= end;
    }
    if (period === "month") {
      return (
        ts.getFullYear() === reference.getFullYear() &&
        ts.getMonth() === reference.getMonth()
      );
    }
    return true;
  });
}

export function aggregateSalesKpis(sales) {
  const rows = sales ?? [];
  const revenue = rows.reduce((sum, s) => sum + Number(s.order_total ?? 0), 0);
  return {
    orderCount: rows.length,
    revenue,
    avgOrder: rows.length ? revenue / rows.length : 0,
  };
}

/** Build 24 hourly buckets from today's completed sales. */
export function buildHourlySalesChart(sales, reference = new Date()) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    label: `${hour}`,
    value: 0,
    revenue: 0,
  }));

  for (const sale of sales ?? []) {
    const ts = getSaleTimestamp(sale);
    if (!ts || !isSameCalendarDay(ts, reference)) continue;
    const hour = ts.getHours();
    buckets[hour].value += 1;
    buckets[hour].revenue += Number(sale.order_total ?? 0);
  }

  return buckets;
}

export function pipelineStepIndex(status, workflow) {
  return workflowPipelineIndex(status, workflow);
}

export function nextTransitionOptions(status, workflow) {
  return workflowNextTransitions(status, workflow);
}

export function saleStatusLabel(status, workflow) {
  return workflowStatusLabel(workflow, status) ?? SALE_STATUS_LABELS[status] ?? status;
}

export function getPaymentMethodKind(method) {
  const code = String(method?.method_code ?? "").toUpperCase();
  if (code.includes("CASH")) return "cash";
  if (code.includes("MPESA") || code.includes("M-PESA") || code.includes("M_PESA")) return "mpesa";
  if (code.includes("CREDIT")) return "credit";
  if (code.includes("CHEQUE") || code.includes("CHECK")) return "cheque";
  return "bank";
}

/**
 * Map POS tender codes (CASH / MPESA / EQUITY / …) onto org payment_methods rows.
 * Bank-specific UI codes fall back to BANK when Equity/KCB/Other rows are not seeded.
 */
export function resolvePaymentMethodByCode(methods, code) {
  const list = Array.isArray(methods) ? methods : [];
  const wanted = String(code ?? "CASH").toUpperCase().trim() || "CASH";
  const aliasesByCode = {
    CASH: ["CASH"],
    MPESA: ["MPESA", "M-PESA", "M_PESA"],
    CHEQUE: ["CHEQUE", "CHECK"],
    CREDIT: ["CREDIT"],
    CARD: ["CARD"],
    VOUCHER: ["VOUCHER"],
    POINTS: ["POINTS"],
    BANK: ["BANK", "BANK_TRANSFER", "TRANSFER"],
    EQUITY: ["EQUITY", "BANK", "BANK_TRANSFER", "TRANSFER"],
    KCB: ["KCB", "BANK", "BANK_TRANSFER", "TRANSFER"],
    OTHER: ["OTHER", "BANK", "BANK_TRANSFER", "TRANSFER"],
  };
  const aliases = aliasesByCode[wanted] ?? [wanted];

  for (const alias of aliases) {
    const exact = list.find((row) => String(row?.method_code ?? "").toUpperCase() === alias);
    if (exact) return exact;
  }

  for (const alias of aliases) {
    const fuzzy = list.find((row) => {
      const rowCode = String(row?.method_code ?? "").toUpperCase();
      return rowCode.includes(alias) || alias.includes(rowCode);
    });
    if (fuzzy) return fuzzy;
  }

  const kindByCode = {
    CASH: "cash",
    MPESA: "mpesa",
    CHEQUE: "cheque",
    CREDIT: "credit",
    EQUITY: "bank",
    KCB: "bank",
    OTHER: "bank",
    BANK: "bank",
    CARD: "bank",
  };
  const kind = kindByCode[wanted] ?? null;
  if (kind) {
    const byKind = list.find((row) => getPaymentMethodKind(row) === kind);
    if (byKind) return byKind;
  }

  return null;
}

function formatPaymentMethodCode(code) {
  const upper = String(code ?? "").toUpperCase();
  if (!upper) return "—";
  if (upper.includes("CASH")) return "Cash";
  if (upper.includes("MPESA") || upper.includes("M-PESA")) return "M-Pesa";
  if (upper.includes("EQUITY")) return "Equity";
  if (upper.includes("KCB")) return "KCB";
  if (upper.includes("CREDIT")) return "Credit";
  if (upper.includes("CHEQUE")) return "Cheque";
  if (upper.includes("BANK")) return "Bank transfer";
  return code;
}

/** True when the order has collected payment (not just a default checkout method code). */
export function saleHasRecordedPayment(sale) {
  if (Number(sale?.amount_paid ?? 0) > 0.001) return true;
  if (Number(sale?.cash ?? 0) > 0) return true;
  if (Number(sale?.mpesa_amount ?? 0) > 0) return true;
  if (Number(sale?.equity_amount ?? 0) > 0) return true;
  if (Number(sale?.kcb_amount ?? 0) > 0) return true;
  if (Number(sale?.voucher_payment_amount ?? 0) > 0) return true;
  if (Number(sale?.points_payment_amount ?? 0) > 0) return true;
  return false;
}

/** Checkout methods used on an order (amount buckets + credit flag). */
export function salePaymentMethods(sale) {
  if (!saleHasRecordedPayment(sale)) {
    return [];
  }

  const methods = [];
  if (Number(sale?.cash ?? 0) > 0) methods.push("Cash");
  if (Number(sale?.mpesa_amount ?? 0) > 0) methods.push("M-Pesa");
  if (Number(sale?.equity_amount ?? 0) > 0) methods.push("Equity");
  if (Number(sale?.kcb_amount ?? 0) > 0) methods.push("KCB");
  if (Number(sale?.voucher_payment_amount ?? 0) > 0) methods.push("Voucher");
  if (Number(sale?.points_payment_amount ?? 0) > 0) methods.push("Points");
  if (sale?.is_credit_sale && !methods.includes("Credit")) methods.push("Credit");
  if (!methods.length && sale?.payment_method_code) {
    methods.push(formatPaymentMethodCode(sale.payment_method_code));
  }
  return methods;
}

export function salePaymentMethodDisplay(sale) {
  const methods = salePaymentMethods(sale);
  if (!methods.length) return { label: "Not paid", methods: [], isMixed: false };
  if (methods.length === 1) return { label: methods[0], methods: [], isMixed: false };
  return { label: "Mixed", methods, isMixed: true };
}

export function cartTotals(lines, orderDiscount = 0) {
  const rows = lines ?? [];
  const subtotal = rows.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
  const tax = rows.reduce((sum, l) => sum + Number(l.product_vat ?? 0), 0);
  const discount = rows.reduce((sum, l) => sum + Number(l.discount_given ?? 0), 0);
  const cappedOrderDiscount = Math.min(
    Math.max(0, Number(orderDiscount ?? 0)),
    subtotal,
  );
  return {
    subtotal,
    tax,
    discount,
    orderDiscount: cappedOrderDiscount,
    total: Math.max(0, subtotal - cappedOrderDiscount),
  };
}
