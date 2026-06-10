"use client";

import Link from "next/link";
import { formatShortDate, formatKesCompact, getSaleTimestamp, StatCard } from "@/components/catalog/catalog-shared";
import { formatCustomerKes } from "@/components/customers/customer-form";
import {
  saleLineDisplayUnitPrice,
  saleLineProductLabel,
  saleLineQtyLabel,
} from "@/lib/sale-line-items";
import {
  pipelineStatusIndex,
  primaryWorkflowAdvanceStatus,
  workflowPipelineSteps,
  workflowStatusLabel,
} from "@/lib/order-workflow";
import {
  PAYMENT_STATUS_LABELS,
  formatReceiptNumber,
  formatSaleKes,
  nextTransitionOptions,
  orderSourceLabel,
  saleCustomerLabel,
  saleStatusLabel,
} from "@/lib/sales";
import {
  OrderSourceBadge,
  PaymentStatusBadge,
  SaleStatusBadge,
} from "./sales-shared";

export const PAYMENT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All payments" },
  { value: "unpaid", label: PAYMENT_STATUS_LABELS.unpaid },
  { value: "partial", label: PAYMENT_STATUS_LABELS.partial },
  { value: "paid", label: PAYMENT_STATUS_LABELS.paid },
];

export const ORDER_SOURCE_FILTER_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "backoffice", label: "Backoffice" },
  { value: "pos", label: "Point of sale" },
  { value: "mobile", label: "Mobile" },
];

export function summarizeOrders(rows) {
  const list = rows ?? [];
  let unpaid = 0;
  let partial = 0;
  let paid = 0;
  let cancelled = 0;
  let revenue = 0;

  for (const sale of list) {
    revenue += Number(sale.order_total ?? 0);
    const ps = String(sale.payment_status ?? "").toLowerCase();
    if (ps === "paid") paid += 1;
    else if (ps === "partial") partial += 1;
    else unpaid += 1;
    if (sale.status === "cancelled") cancelled += 1;
  }

  return {
    total: list.length,
    revenue,
    unpaid,
    partial,
    paid,
    cancelled,
  };
}

export function saleDateKey(sale) {
  const d = getSaleTimestamp(sale);
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shouldGroupOrdersByDate(dateFilter) {
  return dateFilter !== "today";
}

export function formatOrderGroupDate(sale) {
  const d = getSaleTimestamp(sale);
  if (!d || Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OrderSummaryStats({ summary, hint = "Today" }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Orders" value={String(summary.total)} hint={hint} />
      <StatCard label="Revenue" value={formatKesCompact(summary.revenue)} hint={formatSaleKes(summary.revenue)} />
      <StatCard
        label="Unpaid / partial"
        value={String(summary.unpaid + summary.partial)}
        hint={`${summary.unpaid} unpaid · ${summary.partial} partial`}
      />
      <StatCard label="Paid" value={String(summary.paid)} hint={`${summary.cancelled} cancelled`} />
    </div>
  );
}

export function OrderDateGroupRow({ dateLabel, colSpan = 8 }) {
  return (
    <tr className="border-b border-slate-200 bg-slate-100/80">
      <td colSpan={colSpan} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {dateLabel}
      </td>
    </tr>
  );
}

export function matchesOrderSourceFilter(sale, sourceFilter) {
  if (sourceFilter === "all") return true;
  const key = String(sale.order_source ?? sale.channel ?? "").toLowerCase();
  if (sourceFilter === "backoffice") return key === "backoffice" || key === "backend";
  return key === sourceFilter;
}

export function matchesPaymentFilter(sale, paymentFilter) {
  if (paymentFilter === "all") return true;
  return String(sale.payment_status ?? "unpaid").toLowerCase() === paymentFilter;
}

/** Compact pipeline position for list rows. */
export function OrderMiniPipeline({ status, workflow }) {
  const steps = workflowPipelineSteps(workflow);
  if (!steps.length) return null;
  const idx = pipelineStatusIndex(status, workflow);
  const activeIdx = idx >= 0 ? idx : 0;
  const label = workflowStatusLabel(workflow, status);

  return (
    <div className="min-w-[7rem]" title={label}>
      <p className="truncate text-[10px] font-medium text-slate-600">{label}</p>
      <div className="mt-1 flex items-center gap-0.5">
        {steps.map((step, stepIdx) => (
          <span
            key={step.key}
            className={`h-1.5 flex-1 rounded-full ${
              stepIdx <= activeIdx ? "bg-[#185FA5]" : "bg-slate-200"
            }`}
            title={step.label}
          />
        ))}
      </div>
    </div>
  );
}

export function OrderExpandButton({ expanded, onClick, label = "Toggle line items" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#E6F1FB] text-[#185FA5] hover:bg-[#d4e8f9]"
    >
      {expanded ? (
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M3 8h10" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M8 3v10M3 8h10" />
        </svg>
      )}
    </button>
  );
}

export function OrderExpandIcon() {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#E6F1FB] text-[#185FA5]"
      aria-hidden
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 group-open:hidden"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M8 3v10M3 8h10" />
      </svg>
      <svg
        viewBox="0 0 16 16"
        className="hidden h-3.5 w-3.5 group-open:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M3 8h10" />
      </svg>
    </span>
  );
}

export function OrderInlineItems({ items, loading, uomById }) {
  if (loading) {
    return <p className="px-4 py-3 text-xs text-slate-500">Loading items…</p>;
  }
  if (!items?.length) {
    return <p className="px-4 py-3 text-xs text-slate-500">No line items on this order.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <th className="px-4 py-2">Product</th>
          <th className="px-4 py-2 text-center">Qty</th>
          <th className="px-4 py-2 text-right">Price</th>
          <th className="px-4 py-2 text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((line) => (
          <tr
            key={line.id ?? `${line.product_code}-${line.line_no}`}
            className="border-b border-slate-100 last:border-b-0"
          >
            <td className="px-4 py-2.5 text-slate-800">
              {saleLineProductLabel(line)}
              {line.on_wholesale_retail ? (
                <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-800">
                  Retail
                </span>
              ) : null}
            </td>
            <td className="px-4 py-2.5 text-center text-slate-700">
              {saleLineQtyLabel(line, uomById)}
            </td>
            <td className="px-4 py-2.5 text-right text-slate-700">
              {formatSaleKes(saleLineDisplayUnitPrice(line, uomById))}
            </td>
            <td className="px-4 py-2.5 text-right font-medium text-slate-900">
              {formatSaleKes(line.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OrderListWorkflowActions({ sale, workflow, busy, onAdvance, onCancel }) {
  if (!sale || sale.status === "cancelled" || sale.status === "completed") {
    return <span className="text-xs text-slate-400">—</span>;
  }

  const forward = primaryWorkflowAdvanceStatus(sale.status, workflow);
  const canCancel = nextTransitionOptions(sale.status, workflow).includes("cancelled");
  const forwardLabel = forward ? workflowStatusLabel(workflow, forward) : null;

  if (!forward && !canCancel) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {forward ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdvance?.(forward)}
          className="whitespace-nowrap rounded-lg bg-[#185FA5] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#144f8a] disabled:opacity-50"
        >
          {busy ? "Updating…" : `Confirm → ${forwardLabel}`}
        </button>
      ) : null}
      {canCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel?.()}
          className="text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

export function OrderListTableRow({
  sale,
  workflow,
  detail,
  itemsLoading,
  uomById,
  expanded,
  onToggleExpand,
  actionBusy = false,
  onAdvance,
  onCancel,
  columnCount = 9,
}) {
  const href = `/sales/orders/${sale.id}`;
  const items = detail?.items ?? sale.items ?? [];

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/80">
        <td className="w-12 px-4 py-3">
          <OrderExpandButton
            expanded={expanded}
            onClick={onToggleExpand}
            label={`${expanded ? "Hide" : "Show"} items for ${formatReceiptNumber(sale)}`}
          />
        </td>
        <td className="px-4 py-3">
          <Link href={href} className="font-medium text-[#185FA5] hover:underline">
            {formatReceiptNumber(sale)}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">#{sale.order_num}</p>
        </td>
        <td className="px-4 py-3 text-slate-700">{saleCustomerLabel(sale)}</td>
        <td className="px-4 py-3 text-right font-medium text-slate-900">
          {formatSaleKes(sale.order_total)}
        </td>
        <td className="px-4 py-3">
          <SaleStatusBadge status={sale.status} workflow={workflow} />
        </td>
        <td className="px-4 py-3">
          <OrderMiniPipeline status={sale.status} workflow={workflow} />
        </td>
        <td className="px-4 py-3">
          <PaymentStatusBadge status={sale.payment_status} />
        </td>
        <td className="px-4 py-3">
          <OrderSourceBadge source={sale.order_source} channel={sale.channel} />
        </td>
        <td className="px-4 py-3">
          <OrderListWorkflowActions
            sale={sale}
            workflow={workflow}
            busy={actionBusy}
            onAdvance={onAdvance}
            onCancel={onCancel}
          />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-slate-100 bg-slate-50/50">
          <td colSpan={columnCount} className="p-0">
            <OrderInlineItems items={items} loading={itemsLoading} uomById={uomById} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function indexSalesWithItems(list) {
  const map = {};
  for (const sale of list ?? []) {
    if (sale?.items?.length) {
      map[String(sale.id)] = sale;
    }
  }
  return map;
}

export function OrderDetailHeader({ sale, workflow }) {
  if (!sale) return null;
  const isCredit = Boolean(sale.is_credit_sale);
  const isCancelled = sale.status === "cancelled";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales order</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {formatReceiptNumber(sale)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Order #{sale.order_num}
            {sale.channel ? ` · ${String(sale.channel).toUpperCase()} channel` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SaleStatusBadge status={sale.status} workflow={workflow} />
          <PaymentStatusBadge status={sale.payment_status} />
          <OrderSourceBadge source={sale.order_source} channel={sale.channel} />
          {isCredit ? (
            <span className="inline-flex rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-800 ring-1 ring-purple-600/20">
              Credit sale
            </span>
          ) : null}
          {isCancelled ? (
            <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20">
              Cancelled
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <DetailMeta label="Customer" value={saleCustomerLabel(sale)} />
        <DetailMeta label="Created via" value={orderSourceLabel(sale.order_source, sale.channel)} />
        <DetailMeta
          label="Date"
          value={formatShortDate(sale.completed_at ?? sale.created_at)}
        />
        <DetailMeta label="Order total" value={formatSaleKes(sale.order_total)} highlight />
      </dl>
    </div>
  );
}

export function OrderFinancialSummary({ sale, payments, totalPaid, balanceDue }) {
  if (!sale) return null;

  const voucher = Number(sale.voucher_payment_amount ?? 0);
  const points = Number(sale.points_payment_amount ?? 0);
  const cash = Number(sale.cash ?? 0);
  const mpesa = Number(sale.mpesa_amount ?? 0);
  const equity = Number(sale.equity_amount ?? 0);
  const kcb = Number(sale.kcb_amount ?? 0);
  const orderDiscount = Number(sale.order_discount ?? 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Financial summary</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <SummaryRow label="Order total" value={formatSaleKes(sale.order_total)} bold />
        <SummaryRow label="VAT" value={formatSaleKes(sale.total_vat)} />
        {orderDiscount > 0 ? (
          <SummaryRow label="Order discount" value={`−${formatSaleKes(orderDiscount)}`} />
        ) : null}
        {voucher > 0 ? <SummaryRow label="Voucher applied" value={formatSaleKes(voucher)} /> : null}
        {points > 0 ? <SummaryRow label="Points redeemed" value={formatSaleKes(points)} /> : null}
        <SummaryRow label="Recorded payments" value={formatSaleKes(totalPaid)} />
        <SummaryRow label="Amount paid (order)" value={formatSaleKes(sale.amount_paid ?? totalPaid)} />
        <SummaryRow
          label="Balance due"
          value={formatSaleKes(balanceDue)}
          bold={balanceDue > 0}
          accent={balanceDue > 0}
        />
      </dl>

      {(cash > 0 || mpesa > 0 || equity > 0 || kcb > 0) ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Checkout breakdown
          </p>
          <dl className="mt-2 space-y-1.5 text-sm">
            {cash > 0 ? <SummaryRow label="Cash" value={formatSaleKes(cash)} /> : null}
            {mpesa > 0 ? <SummaryRow label="M-Pesa" value={formatSaleKes(mpesa)} /> : null}
            {equity > 0 ? <SummaryRow label="Equity" value={formatSaleKes(equity)} /> : null}
            {kcb > 0 ? <SummaryRow label="KCB" value={formatSaleKes(kcb)} /> : null}
          </dl>
        </div>
      ) : null}

      {sale.payment_method_code ? (
        <p className="mt-4 text-xs text-slate-500">
          Primary method: <span className="font-medium text-slate-700">{sale.payment_method_code}</span>
        </p>
      ) : null}
    </div>
  );
}

export function OrderLineItemsTable({ items }) {
  const rows = items ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-medium text-slate-900">Line items</h2>
        <p className="mt-0.5 text-xs text-slate-500">{rows.length} product(s)</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No line items on this order.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5 text-right">Unit price</th>
                <th className="px-4 py-2.5 text-right">Discount</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.id ?? `${line.line_no}-${line.product_code}`} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{saleLineProductLabel(line)}</p>
                    {line.product_code ? (
                      <p className="mt-0.5 text-xs text-slate-500">{line.product_code}</p>
                    ) : null}
                  </td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OrderPaymentsSection({
  payments,
  methodNameById,
  totalPaid,
  balanceDue,
  onRecordPayment,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-slate-900">Payments</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Recording a payment updates order status per your workflow rules
          </p>
        </div>
        {balanceDue > 0 && onRecordPayment ? (
          <button
            type="button"
            onClick={onRecordPayment}
            className="shrink-0 rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#144f8a]"
          >
            + Record payment
          </button>
        ) : null}
      </div>

      {payments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No payments recorded yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-800">
                  {methodNameById[p.payment_method_id] ?? "Payment"}
                </p>
                {p.reference_number ? (
                  <p className="text-xs text-slate-500">Ref: {p.reference_number}</p>
                ) : null}
                {p.paid_at ? (
                  <p className="text-xs text-slate-500">{formatShortDate(p.paid_at)}</p>
                ) : null}
              </div>
              <span className="font-semibold text-slate-900">{formatSaleKes(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
        <SummaryRow label="Total paid" value={formatSaleKes(totalPaid)} bold />
        {balanceDue > 0 ? (
          <SummaryRow label="Balance due" value={formatSaleKes(balanceDue)} accent />
        ) : (
          <p className="text-xs font-medium text-emerald-700">Fully paid</p>
        )}
      </div>
    </div>
  );
}

export function OrderMetaPanel({ sale, workflow }) {
  if (!sale) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-medium text-slate-900">Order details</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <SummaryRow label="Workflow status" value={saleStatusLabel(sale.status, workflow)} />
        <SummaryRow label="Payment status" value={PAYMENT_STATUS_LABELS[sale.payment_status] ?? sale.payment_status ?? "—"} />
        <SummaryRow label="Channel" value={String(sale.channel ?? "—").toUpperCase()} />
        <SummaryRow label="Created via" value={orderSourceLabel(sale.order_source, sale.channel)} />
        {sale.required_date ? (
          <SummaryRow label="Required date" value={formatShortDate(sale.required_date)} />
        ) : null}
        {sale.delivery_date ? (
          <SummaryRow label="Delivery date" value={formatShortDate(sale.delivery_date)} />
        ) : null}
        {sale.completed_at ? (
          <SummaryRow label="Completed" value={formatShortDate(sale.completed_at)} />
        ) : null}
        {sale.cancelled_at ? (
          <SummaryRow label="Cancelled" value={formatShortDate(sale.cancelled_at)} />
        ) : null}
        <SummaryRow
          label="Stock deducted"
          value={sale.stock_balanced ? "Yes" : "Pending"}
        />
      </dl>
      {sale.comments ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{sale.comments}</p>
      ) : null}
    </div>
  );
}

function DetailMeta({ label, value, highlight = false }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={highlight ? "font-semibold text-slate-900" : "text-slate-800"}>{value}</dd>
    </div>
  );
}

function SummaryRow({ label, value, bold = false, accent = false }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={
          accent
            ? "font-semibold text-amber-700"
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
