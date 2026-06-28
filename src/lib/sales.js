import { formatOrgCurrency } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import { getSaleTimestamp, isSameCalendarDay } from "@/components/catalog/catalog-shared";
import {
  DEFAULT_ORDER_WORKFLOW,
  nextTransitionOptions as workflowNextTransitions,
  pipelineStepIndex as workflowPipelineIndex,
  workflowPipelineSteps,
  workflowStatusLabel,
  workflowTransitions,
} from "@/lib/order-workflow";

export const SALE_STATUS_LABELS = Object.fromEntries(
  DEFAULT_ORDER_WORKFLOW.steps.map((s) => [s.status, s.label]),
);
SALE_STATUS_LABELS.draft = "Draft";
SALE_STATUS_LABELS.held = "Held";
SALE_STATUS_LABELS.cancelled = "Cancelled";

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
};

export function orderSourceLabel(source, fallbackChannel) {
  const key = String(source ?? fallbackChannel ?? "").toLowerCase();
  return ORDER_SOURCE_LABELS[key] ?? key ?? "—";
}

/** Mobile field sales or POS route-order mode (route assigned, channel mobile|pos). */
export function isRouteOrderSale(sale) {
  if (!sale?.route_id) return false;
  const channel = String(sale.channel ?? sale.order_source ?? "").toLowerCase();
  return channel === "mobile" || channel === "pos";
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
  const num =
    typeof saleOrNum === "object"
      ? (saleOrNum.order_num ?? saleOrNum.id)
      : saleOrNum;
  if (num == null || num === "") return "—";
  return `S${String(num).padStart(4, "0")}`;
}

/** Order number and receipt number are the same formatted value (S + padded order_num). */
export function formatReceiptNumber(sale) {
  return formatOrderNumber(sale);
}

export function saleCustomerLabel(sale) {
  if (!sale) return "Walk-in";
  const override = sale.customer_name_override?.trim();
  if (override) return override;
  const relatedName = sale.customer?.customer_name?.trim();
  if (relatedName) return relatedName;
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
  if (code.includes("MPESA") || code.includes("M-PESA")) return "mpesa";
  if (code.includes("CREDIT")) return "credit";
  return "bank";
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

/** Checkout methods used on an order (amount buckets + credit flag). */
export function salePaymentMethods(sale) {
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
  if (!methods.length) return { label: "—", methods: [], isMixed: false };
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
