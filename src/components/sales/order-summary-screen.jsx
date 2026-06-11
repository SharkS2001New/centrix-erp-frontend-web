"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getSaleTimestamp } from "@/components/catalog/catalog-shared";
import { formatCustomerKes } from "@/components/customers/customer-form";
import {
  buildOrderWorkflowTimeline,
  getOrderWorkflow,
  PAYMENT_STEP_KEYS,
} from "@/lib/order-workflow";
import {
  PAYMENT_STATUS_LABELS,
  formatReceiptNumber,
  formatSaleKes,
  orderSourceLabel,
  saleCustomerLabel,
  salePaymentMethodDisplay,
  saleStatusLabel,
} from "@/lib/sales";
import { saleLineProductLabel } from "@/lib/sale-line-items";
import { RecordSalePaymentModal } from "@/components/sales/record-sale-payment-modal";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import { orderDocumentPrintLabel } from "@/lib/sales-settings";
import {
  buildOrderDetailActionItems,
  OrderContextMenu,
  OrderLineItemsTable,
  OrderPaymentsSection,
  saleBranchLabel,
} from "@/components/sales/sales-orders-shared";
import {
  OrderWorkflowPipeline,
  PaymentStatusBadge,
  SaleStatusBadge,
} from "@/components/sales/sales-shared";

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

function SummaryInfoCard({ label, value, hint, hintClassName, href, linkLabel, onLinkClick }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
      {hint ? (
        <p className={`mt-0.5 text-xs ${hintClassName ?? "text-slate-400"}`}>{hint}</p>
      ) : null}
      {linkLabel ? (
        href ? (
          <Link
            href={href}
            className="mt-2 inline-block text-xs font-medium text-[#185FA5] hover:text-[#144f8a]"
          >
            {linkLabel} →
          </Link>
        ) : (
          <button
            type="button"
            onClick={onLinkClick}
            className="mt-2 inline-block text-xs font-medium text-[#185FA5] hover:text-[#144f8a]"
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
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-medium text-slate-900">Order items</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No line items on this order.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
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
            className="text-sm font-medium text-[#185FA5] hover:text-[#144f8a]"
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
                  ? "bg-[#185FA5] ring-blue-100"
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

function CustomerOrderDetailsPanel({ customer, sale, branchName, cashierName, workflow }) {
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
            <DetailRow label="Receipt no." value={formatReceiptNumber(sale)} />
            <DetailRow label="Status" value={saleStatusLabel(sale?.status, workflow)} />
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function OrderSummaryScreen({ saleId, backHref = "/sales/orders" }) {
  const { capabilities, refreshCapabilities } = useAuth();

  const [sale, setSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [branchName, setBranchName] = useState(null);
  const [cashierName, setCashierName] = useState(null);
  const [subCategories, setSubCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState({ x: 0, y: 0 });
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    refreshCapabilities().catch(() => {});
  }, [refreshCapabilities]);

  const loadSale = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [saleData, payRes, methodsRes, subRes, catRes] = await Promise.all([
        apiRequest(`/sales/${saleId}`),
        apiRequest("/sale-payments", {
          searchParams: { per_page: 50, "filter[sale_id]": saleId },
        }).catch(() => ({ data: [] })),
        apiRequest("/payment-methods", { searchParams: { per_page: 50 } }).catch(() => ({ data: [] })),
        apiRequest("/subcategories", { searchParams: { per_page: 500 } }).catch(() => ({ data: [] })),
        apiRequest("/categories", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      ]);

      setSale(saleData);
      setPayments(payRes.data ?? []);
      setPaymentMethods(methodsRes.data ?? []);
      setSubCategories(subRes.data ?? []);
      setCategories(catRes.data ?? []);

      const branchId = saleData.branch_id;
      if (branchId != null) {
        try {
          const branch = await apiRequest(`/branches/${branchId}`);
          setBranchName(branch.branch_name ?? null);
        } catch {
          setBranchName(null);
        }
      } else {
        setBranchName(null);
      }

      if (saleData.cashier_id != null) {
        try {
          const user = await apiRequest(`/users/${saleData.cashier_id}`);
          setCashierName(user.name ?? user.full_name ?? user.username ?? null);
        } catch {
          setCashierName(null);
        }
      } else {
        setCashierName(null);
      }

      if (saleData.customer_num) {
        try {
          const cust = await apiRequest(`/customers/${saleData.customer_num}`);
          setCustomer(cust);
        } catch {
          setCustomer(null);
        }
      } else {
        setCustomer(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    loadSale();
  }, [loadSale]);

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
  const balanceDue = Math.max(0, Number(sale?.order_total ?? 0) - totalPaid);
  const canRecordPayment = balanceDue > 0 && sale?.status !== "cancelled";

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

  const handlePrint = useCallback(() => {
    void printSaleOrder(sale, {
      organizationName: capabilities?.profile_label ?? "POS / ERP",
      moduleSettings: capabilities?.module_settings,
      capabilities,
      customer,
      branch: branchName ? { name: branchName } : null,
      preparedBy: cashierName,
    });
  }, [sale, capabilities, customer, branchName, cashierName]);

  function openActionsMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setActionsAnchor({ x: Math.max(8, rect.right - 220), y: rect.bottom + 4 });
    setActionsOpen(true);
  }

  async function transitionOrder(targetStatus) {
    if (!sale?.id) return;
    if (targetStatus === "cancelled" && !window.confirm("Cancel this order?")) return;
    setTransitionBusy(true);
    setActionMessage(null);
    try {
      const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
        method: "POST",
        body: { status: targetStatus },
      });
      setSale((prev) => ({ ...prev, ...updated }));
      setActionMessage("Order updated.");
      setActionsOpen(false);
      await loadSale();
    } catch (e) {
      setActionMessage(e instanceof ApiError ? e.message : "Could not update order.");
    } finally {
      setTransitionBusy(false);
    }
  }

  const printLabel = orderDocumentPrintLabel(capabilities?.module_settings);

  const actionMenuItems = useMemo(() => {
    if (!sale) return [];
    return buildOrderDetailActionItems({
      sale,
      workflow: saleWorkflow,
      busy: transitionBusy,
      onPrint: handlePrint,
      onAdvance: transitionOrder,
      onCancel: () => transitionOrder("cancelled"),
      canRecordPayment,
      printLabel,
      onRecordPayment: () => {
        setActionsOpen(false);
        setPaymentModalOpen(true);
      },
    });
  }, [sale, saleWorkflow, transitionBusy, canRecordPayment, handlePrint, printLabel]);

  const customerProfileHref = sale?.customer_num ? `/customers/${sale.customer_num}` : null;
  const customerCardName = customer?.customer_name ?? saleCustomerLabel(sale);
  const orderDateRaw = sale?.completed_at ?? sale?.created_at;

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href={backHref} className="hover:text-[#185FA5]">
          Sales orders
        </Link>
        <span className="mx-2 text-slate-300">›</span>
        <span className="font-medium text-slate-700">
          Order #{sale ? formatReceiptNumber(sale) : "…"}
        </span>
      </nav>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {actionMessage ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {actionMessage}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading order…</p>
      ) : sale ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-900">
                  Order #{formatReceiptNumber(sale)}
                </h1>
                <SaleStatusBadge status={sale.status} workflow={saleWorkflow} />
                {sale.payment_status && sale.payment_status !== sale.status ? (
                  <PaymentStatusBadge status={sale.payment_status} />
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Placed on {formatOrderDateTime(orderDateRaw)}
                {branchName ? ` · ${branchName}` : ""}
                {cashierName ? ` · Cashier: ${cashierName}` : ""}
              </p>
              <div className="mt-4 max-w-3xl">
                <OrderWorkflowPipeline
                  status={sale.status}
                  workflow={saleWorkflow}
                  orderSource={sale.order_source}
                  channel={sale.channel}
                  onAdvance={
                    sale.status !== "cancelled" && sale.status !== "completed"
                      ? (status) => transitionOrder(status)
                      : null
                  }
                  busyStatus={transitionBusy ? sale.status : null}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <PrintIcon />
                {printLabel}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <DownloadIcon />
                Download
              </button>
              <button
                type="button"
                onClick={openActionsMenu}
                className="inline-flex items-center gap-2 rounded-lg bg-[#185FA5] px-3 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
              >
                Actions
                <ChevronDownIcon />
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

          <div className="mb-6 border-b border-slate-200">
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
                        ? "border-[#185FA5] text-[#185FA5]"
                        : "border-transparent text-slate-500 hover:text-slate-800"
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
              <OrderTimelinePanel events={timelineEvents} />
              <CustomerOrderDetailsPanel
                customer={customer}
                sale={sale}
                branchName={branchName ?? saleBranchLabel(sale, new Map())}
                cashierName={cashierName}
                workflow={saleWorkflow}
              />
            </div>
          ) : null}

          {activeTab === "items" ? (
            <OrderLineItemsTable items={sale.items} />
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
              />
            </div>
          ) : null}

          {activeTab === "notes" ? (
            <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">Notes</h2>
              {sale.comments?.trim() ? (
                <p className="mt-4 text-sm text-slate-700">{sale.comments}</p>
              ) : (
                <p className="mt-4 text-sm text-slate-500">No notes on this order.</p>
              )}
            </div>
          ) : null}

          {activeTab === "documents" ? (
            <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-medium text-slate-900">Documents</h2>
              <p className="mt-4 text-sm text-slate-500">No documents attached to this order.</p>
            </div>
          ) : null}
        </>
      ) : null}

      <OrderContextMenu
        open={actionsOpen}
        x={actionsAnchor.x}
        y={actionsAnchor.y}
        items={actionMenuItems}
        onClose={() => setActionsOpen(false)}
      />

      <RecordSalePaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        saleId={saleId}
        balanceDue={balanceDue}
        onSaved={loadSale}
      />
    </div>
  );
}
