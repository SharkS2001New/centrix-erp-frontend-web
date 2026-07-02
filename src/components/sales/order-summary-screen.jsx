"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import { formatShortDate, getSaleTimestamp } from "@/components/catalog/catalog-shared";
import { formatCustomerKes } from "@/components/customers/customer-form";
import {
  buildOrderWorkflowTimeline,
  canCancelOrder,
  getOrderWorkflow,
  isPaymentGatedWorkflowTransition,
  PAYMENT_STEP_KEYS,
  resolveOrderWorkflowActions,
  shouldShowPaymentStatusBadge,
  saleBalanceDue,
  saleNeedsPaymentCollection,
  canRecordOrderPayment,
} from "@/lib/order-workflow";
import {
  PAYMENT_STATUS_LABELS,
  formatOrderNumber,
  formatReceiptNumber,
  formatSaleKes,
  orderSourceLabel,
  saleCustomerLabel,
  salePaymentMethodDisplay,
  saleStatusLabel,
} from "@/lib/sales";
import { isLegacySale, saleLineProductLabel } from "@/lib/sale-line-items";
import { SalePosPaymentPanel } from "@/components/sales/sale-pos-payment-panel";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import { orderDocumentPrintLabel, defaultOrderListPrintDocumentType, isOrderCancellationApprovalEnabled } from "@/lib/sales-settings";
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
import {
  OrderLineItemsTable,
  OrderPaymentsSection,
  saleBranchLabel,
} from "@/components/sales/sales-orders-shared";
import {
  OrderWorkflowPipeline,
  PaymentStatusBadge,
  SaleStatusBadge,
} from "@/components/sales/sales-shared";
import { ReturnStatusBadge } from "@/components/sales/customer-returns-shared";
import { useConfirm } from "@/lib/use-confirm";
import { useFulfillmentTransition } from "@/lib/use-fulfillment-transition";
import {
  FulfillmentAssignmentDialog,
  PodCaptureDialog,
} from "@/components/fulfillment/fulfillment-assignment-dialog";
import { BackofficeOrderEditModal } from "@/components/sales/backoffice-order-edit-modal";
import { getSaleDriverId, getSaleVehicleId } from "@/components/fulfillment/fulfillment-shared";

const ORDER_TABS = [
  { id: "summary", label: "Summary" },
  { id: "items", label: "Items", countKey: "items" },
  { id: "payments", label: "Payments", countKey: "payments" },
  { id: "timeline", label: "Timeline" },
  { id: "notes", label: "Notes" },
  { id: "documents", label: "Documents" },
];

function formatOrderDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeAgo(sale) {
  const ts = getSaleTimestamp(sale);
  if (!ts || Number.isNaN(ts.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDate = new Date(ts);
  startOfDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function orderTypeLabel(sale) {
  const source = orderSourceLabel(sale?.order_source, sale?.channel);
  if (sale?.channel === "pos" || sale?.order_source === "pos") return "Retail sale";
  if (sale?.channel === "mobile" || sale?.order_source === "mobile") return "Mobile order";
  return source;
}

function productCategoryLabel(line, subById, catById) {
  const subId = line?.product?.subcategory_id;
  if (subId == null || !subById.has(subId)) return null;
  const sub = subById.get(subId);
  const catId = sub?.category_id;
  if (catId != null && catById.has(catId)) return catById.get(catId).category_name;
  return sub?.subcategory_name ?? null;
}

function workflowStepDetail(sale, step, payments) {
  if (PAYMENT_STEP_KEYS.has(step.key)) {
    const paymentStatus = String(sale?.payment_status ?? "").toLowerCase();
    if (paymentStatus === "paid" || paymentStatus === "partial") {
      const methods = salePaymentMethodDisplay(sale);
      const methodText = methods.isMixed ? methods.methods.join(" and ") : methods.label;
      if (methodText && methodText !== "—") {
        return `Payment recorded via ${methodText}.`;
      }
    }
    if (step.key === "unpaid") return "Order is awaiting payment.";
    if (step.key === "pending_payment") return "Partial payment recorded on this order.";
  }
  return `Order marked as ${step.label.toLowerCase()}.`;
}

function OrderReturnsPanel({ returns, saleId, totalReturned }) {
  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="theme-heading text-sm font-medium">Returns</h2>
            <p className="theme-subtext mt-0.5 text-xs">
            {returns.length
              ? `${returns.length} return(s) linked to this order. Approved returns reduce line quantities and order total below.`
              : "No returns recorded for this order yet"}
          </p>
        </div>
        <Link
          href={`/sales/returns/new?sale_id=${saleId}`}
          className="text-sm font-medium text-[var(--theme-primary)] hover:underline"
        >
          Create return
        </Link>
      </div>
      {returns.length ? (
        <>
          <div className="theme-table-shell overflow-hidden">
            <table className="w-full text-sm">
              <thead className="theme-table-head-row text-left text-xs">
                <tr>
                  <th className="px-3 py-2">Return no.</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((row) => (
                  <tr key={row.id} className="theme-table-body-row">
                    <td className="px-3 py-2">
                      <Link
                        href={`/sales/returns?return_id=${row.id}`}
                        className="font-medium text-[var(--theme-primary)] hover:underline"
                      >
                        {row.return_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.return_date ? formatShortDate(row.return_date) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <ReturnStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatSaleKes(row.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalReturned > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Refunded amounts above are already deducted from the order line quantities and total.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SummaryInfoCard({ label, value, hint, hintClassName, href, linkLabel, onLinkClick }) {
  return (
    <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
      <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="theme-heading mt-1 text-base font-semibold">{value}</div>
      {hint ? (
        <p className={`theme-subtext mt-0.5 text-xs ${hintClassName ?? ""}`}>{hint}</p>
      ) : null}
      {linkLabel ? (
        href ? (
          <Link
            href={href}
            className="mt-2 inline-block text-xs font-medium text-[var(--theme-primary)] hover:text-[var(--theme-primary-hover)]"
          >
            {linkLabel} →
          </Link>
        ) : (
          <button
            type="button"
            onClick={onLinkClick}
            className="mt-2 inline-block text-xs font-medium text-[var(--theme-primary)] hover:text-[var(--theme-primary-hover)]"
          >
            {linkLabel} →
          </button>
        )
      ) : null}
    </div>
  );
}

function OrderSummaryItemsTable({ items, subById, catById, limit, onViewAll }) {
  const rows = limit ? (items ?? []).slice(0, limit) : (items ?? []);

  return (
    <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b border-[var(--theme-border)] px-5 py-4">
        <h2 className="theme-heading text-sm font-medium">Order items</h2>
      </div>
      {rows.length === 0 ? (
        <p className="theme-subtext px-5 py-8 text-center text-sm">No line items on this order.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="theme-table-head-row text-left text-xs font-medium">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Unit price</th>
                <th className="px-4 py-2.5 text-right">Discount</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => {
                const category = productCategoryLabel(line, subById, catById);
                const sku = line.product_code ?? line.product?.product_code ?? "—";
                return (
                  <tr key={line.id ?? `${line.line_no}-${sku}`} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                          {(line.product?.product_name ?? line.product_code ?? "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{saleLineProductLabel(line)}</p>
                          {category ? (
                            <p className="mt-0.5 text-xs text-slate-500">{category}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sku}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{line.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatCustomerKes(line.selling_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {Number(line.discount_given ?? 0) > 0
                        ? formatCustomerKes(line.discount_given)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCustomerKes(line.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {limit && (items?.length ?? 0) > limit ? (
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-medium text-[var(--theme-primary)] hover:text-[var(--theme-primary-hover)]"
          >
            View all items
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OrderTotalsPanel({ sale, totalPaid, balanceDue }) {
  const items = sale?.items ?? [];
  const subtotal = items.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
  const orderDiscount = Number(sale?.order_discount ?? 0);
  const vat = Number(sale?.total_vat ?? 0);
  const vatRate = subtotal > 0 ? Math.round((vat / subtotal) * 100) : 0;
  const amountPaid = Number(sale?.amount_paid ?? totalPaid ?? 0);

  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Order totals</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <TotalsRow label="Subtotal" value={formatSaleKes(subtotal)} />
        <TotalsRow
          label="Discount"
          value={orderDiscount > 0 ? `− ${formatSaleKes(orderDiscount)}` : formatSaleKes(0)}
        />
        <TotalsRow label={`Tax (VAT ${vatRate}%)`} value={formatSaleKes(vat)} />
        <TotalsRow label="Total amount" value={formatSaleKes(sale?.order_total)} bold />
        <TotalsRow label="Amount paid" value={formatSaleKes(amountPaid)} paid />
      </dl>
      <div
        className={`mt-4 rounded-lg px-4 py-3 ${
          balanceDue > 0 ? "bg-amber-50" : "bg-emerald-50"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">Balance</span>
          <span
            className={`text-lg font-semibold ${
              balanceDue > 0 ? "text-amber-800" : "text-emerald-700"
            }`}
          >
            {formatSaleKes(balanceDue)}
          </span>
        </div>
      </div>
    </div>
  );
}

function TotalsRow({ label, value, bold = false, paid = false }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          paid
            ? "font-medium text-emerald-700"
            : bold
              ? "font-semibold text-slate-900"
              : "text-slate-800"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function OrderTimelinePanel({ events }) {
  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Order timeline</h2>
      {events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No timeline events yet.</p>
      ) : (
        <ol className="mt-5 space-y-0">
          {events.map((event, index) => {
            const isLast = index === events.length - 1;
            const dotClass = event.cancelled
              ? "bg-red-500 ring-red-100"
              : event.complete
                ? "bg-emerald-500 ring-emerald-100"
                : event.current
                  ? "bg-[var(--theme-primary)] ring-blue-100"
                  : "bg-slate-300 ring-slate-100";
            return (
              <li key={event.key} className="relative flex gap-3 pb-6 last:pb-0">
                {!isLast ? (
                  <span
                    className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-px bg-slate-200"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={`relative z-10 mt-0.5 h-4 w-4 shrink-0 rounded-full ring-4 ${dotClass}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{event.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{event.detail}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatOrderDateTime(event.at)}
                    {event.actor ? ` · ${event.actor}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function CustomerOrderDetailsPanel({
  customer,
  sale,
  branchName,
  cashierName,
  workflow,
  routeName,
  driverName,
  vehicleLabel,
}) {
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const meta = sale?.fulfillment_meta;

  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-slate-900">Customer information</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <DetailRow label="Name" value={customerName} />
            <DetailRow label="Phone" value={customer?.phone_number ?? "—"} />
            <DetailRow label="Email" value={customer?.email ?? "—"} />
            <DetailRow label="Address" value={customer?.physical_address ?? customer?.address ?? "—"} />
          </dl>
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-900">Order information</h3>
          <dl className="mt-4 space-y-2 text-sm">
            <DetailRow label="Order type" value={orderTypeLabel(sale)} />
            <DetailRow label="Branch" value={branchName ?? "—"} />
            <DetailRow label="Cashier" value={cashierName ?? "—"} />
            <DetailRow label="Order no." value={formatOrderNumber(sale)} />
            <DetailRow label="Status" value={saleStatusLabel(sale?.status, workflow)} />
            {routeName ? <DetailRow label="Route" value={routeName} /> : null}
            {driverName ? <DetailRow label="Driver" value={driverName} /> : null}
            {vehicleLabel ? <DetailRow label="Vehicle" value={vehicleLabel} /> : null}
            {sale?.delivery_date ? (
              <DetailRow label="Delivered" value={formatShortDate(sale.delivery_date)} />
            ) : null}
            {meta?.pod_signer_name ? (
              <DetailRow label="Received by" value={meta.pod_signer_name} />
            ) : null}
            {meta?.route_markup?.message ? (
              <DetailRow label="Pricing note" value={meta.route_markup.message} />
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

async function loadOrderRelatedDetails(saleData) {
  const branchId = saleData.branch_id;
  let branchName = null;
  if (branchId != null) {
    try {
      const branch = await apiRequest(`/branches/${branchId}`);
      branchName = branch.branch_name ?? null;
    } catch {
      branchName = null;
    }
  }

  const inlineActorName = saleData.created_by_name ?? saleData.cashier_name ?? null;
  let cashierName = inlineActorName;
  if (!cashierName && (saleData.created_by != null || saleData.cashier_id != null)) {
    const actorIds = [
      ...new Set(
        [saleData.created_by, saleData.cashier_id].filter((id) => id != null && id !== ""),
      ),
    ];
    for (const actorId of actorIds) {
      try {
        const actor = await apiRequest(`/users/${actorId}`);
        cashierName = actor.full_name ?? actor.name ?? actor.username ?? null;
        if (cashierName) break;
      } catch {
        // try next id
      }
    }
  }

  let customer = null;
  if (saleData.customer_num) {
    try {
      customer = await apiRequest(`/customers/${saleData.customer_num}`);
    } catch {
      customer = null;
    }
  }

  return { branchName, cashierName, customer };
}

export function OrderSummaryScreen({ saleId, backHref = "/sales/orders" }) {
  const confirm = useConfirm();
  const { capabilities, organization, user, hasPermission } = useAuth();
  const { floatSessionId } = usePosSession();

  const [sale, setSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [branchName, setBranchName] = useState(null);
  const [cashierName, setCashierName] = useState(null);
  const [subCategories, setSubCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("summary");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [orderReturns, setOrderReturns] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [editOrderOpen, setEditOrderOpen] = useState(false);

  const loadSale = useCallback(async () => {
    setLoading(true);
    try {
      const [saleData, payRes, methodsRes, subRes, catRes, returnsRes, uomRes, routeRes, driverRes, vehicleRes] = await Promise.all([
        apiRequest(`/sales/${saleId}`),
        apiRequest("/sale-payments", {
          searchParams: { per_page: 50, "filter[sale_id]": saleId },
        }).catch(() => ({ data: [] })),
        apiRequest("/payment-methods", { searchParams: { per_page: 50 } }).catch(() => ({ data: [] })),
        apiRequest("/subcategories", { searchParams: { per_page: 500 } }).catch(() => ({ data: [] })),
        apiRequest("/categories", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
        apiRequest("/customer-returns", {
          searchParams: { sale_id: saleId, per_page: 50 },
        }).catch(() => ({ data: [] })),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
        apiRequest("/routes", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
        apiRequest("/drivers", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
        apiRequest("/vehicles", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      ]);

      setSale(saleData);
      setPayments(payRes.data ?? []);
      setPaymentMethods(methodsRes.data ?? []);
      setSubCategories(subRes.data ?? []);
      setCategories(catRes.data ?? []);
      setOrderReturns(returnsRes.data ?? []);
      setUoms(uomRes.data ?? []);
      setRoutes(routeRes.data ?? []);
      setDrivers(driverRes.data ?? []);
      setVehicles(vehicleRes.data ?? []);

      const { branchName, cashierName, customer } = await loadOrderRelatedDetails(saleData);
      setBranchName(branchName);
      setCashierName(cashierName);
      setCustomer(customer);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    loadSale();
  }, [loadSale]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const saleWorkflow = useMemo(
    () => getOrderWorkflow(capabilities, sale),
    [capabilities, sale],
  );

  const subById = useMemo(() => new Map(subCategories.map((s) => [s.id, s])), [subCategories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const totalPaid = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [payments],
  );
  const balanceDue = saleBalanceDue(sale, totalPaid);
  const canRecordPayment = canRecordOrderPayment(sale, totalPaid);
  const cancellationAllowed = useMemo(
    () => canCancelOrder(sale, saleWorkflow, capabilities),
    [sale, saleWorkflow, capabilities],
  );
  const canDirectCancel = Boolean(user?.is_admin || hasPermission("sales.manage"));
  const canRequestCancellation = useMemo(
    () =>
      cancellationAllowed &&
      isOrderCancellationApprovalEnabled(capabilities?.module_settings) &&
      !canDirectCancel,
    [cancellationAllowed, capabilities?.module_settings, canDirectCancel],
  );

  const methodNameById = useMemo(() => {
    const map = {};
    for (const m of paymentMethods) map[m.id] = m.method_name;
    return map;
  }, [paymentMethods]);

  const paymentDisplay = useMemo(() => salePaymentMethodDisplay(sale), [sale]);
  const paymentCardValue = paymentDisplay.isMixed
    ? paymentDisplay.methods.join(", ")
    : paymentDisplay.label;

  const timelineEvents = useMemo(
    () =>
      buildOrderWorkflowTimeline(sale, saleWorkflow, {
        actor: cashierName ?? "System",
        payments,
        stepDetail: workflowStepDetail,
      }),
    [sale, saleWorkflow, payments, cashierName],
  );

  const tabCounts = useMemo(
    () => ({
      items: sale?.items?.length ?? 0,
      payments: payments.length,
    }),
    [sale, payments],
  );

  const handlePrint = useCallback(async () => {
    if (!sale) return;

    const cachedType = defaultOrderListPrintDocumentType(
      capabilities?.module_settings,
      capabilities,
    );
    const printWindow =
      cachedType !== "both"
        ? openBlankPrintWindow(printWindowFeatures(cachedType))
        : null;
    if (cachedType !== "both" && !printWindow) {
      notifyError(PRINT_BLOCKED_MESSAGE);
      return;
    }

    try {
      const printed = await printSaleOrder(sale, {
        organization,
        organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
        moduleSettings: capabilities?.module_settings,
        capabilities,
        customer,
        branch: branchName ? { name: branchName } : null,
        user,
        uomById,
        printWindow,
        documentType: cachedType,
      });
      if (!printed) {
        disposePrintWindow(printWindow);
      }
    } catch (e) {
      disposePrintWindow(printWindow);
      notifyError(e instanceof Error ? e.message : "Print failed");
    }
  }, [sale, capabilities, organization, customer, branchName, cashierName, uomById, user]);

  async function requestOrderCancellation() {
    if (!sale?.id) return;
    const reason = window.prompt("Reason for cancellation (required):");
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) notifyError("Cancellation reason must be at least 3 characters.");
      return;
    }
    setTransitionBusy(true);
    try {
      await apiRequest(`/sales/orders/${sale.id}/request-cancellation`, {
        method: "POST",
        body: { reason: reason.trim() },
      });
      notifySuccess("Cancellation request sent to managers for approval.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not submit cancellation request.");
    } finally {
      setTransitionBusy(false);
    }
  }

  async function transitionOrder(targetStatus, fulfillmentMeta) {
    if (!sale?.id) return;
    if (targetStatus === "cancelled") {
      const ok = await confirm({
        title: "Cancel order",
        message: "Cancel this order?",
        confirmLabel: "Cancel order",
        destructive: true,
      });
      if (!ok) return;
    }
    setTransitionBusy(true);
    try {
      const body = { status: targetStatus };
      if (fulfillmentMeta) body.fulfillment_meta = fulfillmentMeta;
      const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
        method: "POST",
        body,
      });
      setSale((prev) => ({ ...prev, ...updated }));
      notifySuccess("Order updated.");
      await loadSale();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not update order.");
    } finally {
      setTransitionBusy(false);
    }
  }

  const fulfillment = useFulfillmentTransition({
    capabilities,
    onSuccess: async (updated) => {
      setSale((prev) => ({ ...prev, ...updated }));
      notifySuccess("Order updated.");
      await loadSale();
    },
    onError: (message) => notifyError(message),
  });

  function handleAdvance(targetStatus) {
    if (targetStatus === "cancelled") {
      if (!cancellationAllowed) return;
      if (canRequestCancellation) {
        void requestOrderCancellation();
        return;
      }
      void transitionOrder(targetStatus);
      return;
    }
    if (isPaymentGatedWorkflowTransition(sale, targetStatus, totalPaid)) {
      setPaymentModalOpen(true);
      return;
    }
    if (!sale) return;
    fulfillment.requestTransition(sale, targetStatus);
  }

  const printLabel = orderDocumentPrintLabel(capabilities?.module_settings, capabilities);
  const createReturnHref =
    sale?.id && sale?.status === "completed" ? `/sales/returns/new?sale_id=${sale.id}` : null;
  const totalReturned = useMemo(
    () =>
      orderReturns
        .filter((row) => String(row.status).toLowerCase() === "approved")
        .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
    [orderReturns],
  );

  const fulfillmentLabels = useMemo(() => {
    if (!sale) return {};
    const routeName = routes.find((r) => r.id === sale.route_id)?.route_name;
    const driverId = getSaleDriverId(sale);
    const vehicleId = getSaleVehicleId(sale);
    const driver = drivers.find((d) => d.id === driverId);
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    return {
      routeName: routeName ?? null,
      driverName: driver?.full_name ?? driver?.driver_code ?? null,
      vehicleLabel: vehicle?.plate_number ?? vehicle?.vehicle_name ?? null,
    };
  }, [sale, routes, drivers, vehicles]);

  const customerProfileHref = sale?.customer_num ? `/customers/${sale.customer_num}` : null;
  const customerCardName = customer?.customer_name ?? saleCustomerLabel(sale);
  const orderDateRaw = sale?.completed_at ?? sale?.created_at;

  return (
    <div className="theme-workspace min-h-full">
      <nav className="theme-subtext mb-4 text-sm" aria-label="Breadcrumb">
        <Link href={backHref} className="theme-link">
          Sales orders
        </Link>
        <span className="mx-2 opacity-40">›</span>
        <span className="theme-heading font-medium">
          Order #{sale ? formatOrderNumber(sale) : "…"}
        </span>
      </nav>

      {loading ? (
        <p className="theme-subtext text-sm">Loading order…</p>
      ) : sale ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="theme-heading text-2xl font-semibold">
                  Order #{formatOrderNumber(sale)}
                </h1>
                <SaleStatusBadge status={sale.status} workflow={saleWorkflow} />
                {shouldShowPaymentStatusBadge(sale, totalPaid) ? (
                  <PaymentStatusBadge status={sale.payment_status} />
                ) : null}
              </div>
              <p className="theme-subtext mt-1 text-sm">
                Placed on {formatOrderDateTime(orderDateRaw)}
                {branchName ? ` · ${branchName}` : ""}
                {cashierName ? ` · Cashier: ${cashierName}` : ""}
              </p>
              <div className="mt-4 max-w-3xl">
                <OrderWorkflowPipeline
                  sale={sale}
                  status={sale.status}
                  workflow={saleWorkflow}
                  orderSource={sale.order_source}
                  channel={sale.channel}
                  totalPaid={totalPaid}
                  balanceDue={balanceDue}
                  onCollectPayment={
                    canRecordPayment ? () => setPaymentModalOpen(true) : null
                  }
                  onAdvance={
                    sale.status !== "cancelled" && sale.status !== "completed"
                      ? (status) => handleAdvance(status)
                      : null
                  }
                  canCancel={cancellationAllowed}
                  busyStatus={transitionBusy || fulfillment.busy ? sale.status : null}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sale.can_edit_lines ? (
                <button
                  type="button"
                  onClick={() => setEditOrderOpen(true)}
                  className="theme-secondary-btn inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                >
                  Edit Order
                </button>
              ) : null}
              {createReturnHref ? (
                <Link
                  href={createReturnHref}
                  className="theme-secondary-btn inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                >
                  Create return
                </Link>
              ) : null}
              <button
                type="button"
                onClick={handlePrint}
                className="theme-secondary-btn inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <PrintIcon />
                {printLabel}
              </button>
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryInfoCard
              label="Customer"
              value={customerCardName}
              href={customerProfileHref}
              linkLabel="View profile"
            />
            <SummaryInfoCard
              label="Order date"
              value={formatOrderDateTime(orderDateRaw)}
              hint={formatRelativeAgo(sale)}
            />
            <SummaryInfoCard
              label="Status"
              value={saleStatusLabel(sale.status, saleWorkflow)}
              hint={PAYMENT_STATUS_LABELS[sale.payment_status] ?? null}
              linkLabel="View timeline"
              onLinkClick={() => setActiveTab("timeline")}
            />
            <SummaryInfoCard
              label="Payment method"
              value={paymentCardValue}
              linkLabel="View payments"
              onLinkClick={() => setActiveTab("payments")}
            />
            <SummaryInfoCard
              label="Total amount"
              value={formatSaleKes(sale.order_total)}
              hint={PAYMENT_STATUS_LABELS[sale.payment_status] ?? sale.payment_status}
              hintClassName={
                String(sale.payment_status).toLowerCase() === "paid"
                  ? "font-medium text-emerald-600"
                  : "text-slate-400"
              }
            />
          </div>

          <div className="mb-6 border-b border-[var(--theme-border)]">
            <div className="flex flex-wrap gap-1">
              {ORDER_TABS.map((tab) => {
                const count = tab.countKey ? tabCounts[tab.countKey] : null;
                const label = count != null ? `${tab.label} (${count})` : tab.label;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                      active
                        ? "border-[var(--theme-primary)] text-[var(--theme-primary)]"
                        : "border-transparent theme-subtext hover:text-[var(--theme-text)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === "summary" ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <OrderSummaryItemsTable
                items={sale.items}
                subById={subById}
                catById={catById}
                limit={5}
                onViewAll={() => setActiveTab("items")}
              />
              <OrderTotalsPanel sale={sale} totalPaid={totalPaid} balanceDue={balanceDue} />
              <OrderReturnsPanel returns={orderReturns} saleId={sale.id} totalReturned={totalReturned} />
              <OrderTimelinePanel events={timelineEvents} />
              <CustomerOrderDetailsPanel
                customer={customer}
                sale={sale}
                branchName={branchName ?? saleBranchLabel(sale, new Map())}
                cashierName={cashierName}
                workflow={saleWorkflow}
                {...fulfillmentLabels}
              />
            </div>
          ) : null}

          {activeTab === "items" ? (
            <OrderLineItemsTable
              items={sale.items}
              uomById={uomById}
              legacyPrint={isLegacySale(sale)}
            />
          ) : null}

          {activeTab === "payments" ? (
            <div className="max-w-2xl">
              <OrderPaymentsSection
                payments={payments}
                methodNameById={methodNameById}
                totalPaid={totalPaid}
                balanceDue={balanceDue}
                onRecordPayment={canRecordPayment ? () => setPaymentModalOpen(true) : null}
              />
            </div>
          ) : null}

          {activeTab === "timeline" ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <OrderTimelinePanel events={timelineEvents} />
              <CustomerOrderDetailsPanel
                customer={customer}
                sale={sale}
                branchName={branchName}
                cashierName={cashierName}
                workflow={saleWorkflow}
                {...fulfillmentLabels}
              />
            </div>
          ) : null}

          {activeTab === "notes" ? (
            <div className="max-w-2xl theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">Notes</h2>
              {sale.comments?.trim() ? (
                <p className="mt-4 text-sm text-slate-700">{sale.comments}</p>
              ) : (
                <p className="mt-4 text-sm text-slate-500">No notes on this order.</p>
              )}
            </div>
          ) : null}

          {activeTab === "documents" ? (
            <div className="max-w-2xl theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">Documents</h2>
              <p className="mt-4 text-sm text-slate-500">No documents attached to this order.</p>
            </div>
          ) : null}
        </>
      ) : null}

      <SalePosPaymentPanel
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        sale={sale}
        balanceDue={balanceDue}
        capabilities={capabilities}
        floatSessionId={floatSessionId}
        onPaid={async () => {
          setPaymentModalOpen(false);
          await loadSale();
          notifySuccess("Payment recorded.");
        }}
      />

      <BackofficeOrderEditModal
        open={editOrderOpen}
        sale={sale}
        uomById={uomById}
        onClose={() => setEditOrderOpen(false)}
        onSaved={(updated) => {
          setEditOrderOpen(false);
          if (updated?.id) {
            setSale((prev) => ({ ...prev, ...updated }));
          }
          void loadSale();
          notifySuccess("Order updated.");
        }}
      />

      <FulfillmentAssignmentDialog
        open={Boolean(fulfillment.assignDialog)}
        sale={fulfillment.assignDialog?.sale}
        targetStatus={fulfillment.assignDialog?.targetStatus}
        drivers={fulfillment.drivers.length ? fulfillment.drivers : drivers}
        vehicles={fulfillment.vehicles.length ? fulfillment.vehicles : vehicles}
        routes={fulfillment.routes.length ? fulfillment.routes : routes}
        busy={fulfillment.busy}
        onClose={() => fulfillment.setAssignDialog(null)}
        onConfirm={(meta) => {
          const { sale: dialogSale, targetStatus } = fulfillment.assignDialog ?? {};
          if (dialogSale) void fulfillment.runTransition(dialogSale, targetStatus, meta);
        }}
      />
      <PodCaptureDialog
        open={Boolean(fulfillment.podDialog)}
        sale={fulfillment.podDialog?.sale}
        busy={fulfillment.busy}
        onClose={() => fulfillment.setPodDialog(null)}
        onConfirm={(meta) => {
          const { sale: dialogSale, targetStatus } = fulfillment.podDialog ?? {};
          if (dialogSale) void fulfillment.runTransition(dialogSale, targetStatus, meta);
        }}
      />
    </div>
  );
}
