"use client";

import { pipelineStatusIndex, workflowPipelineSteps, workflowStatusLabel } from "@/lib/order-workflow";
import {
  PAYMENT_STATUS_LABELS,
  SALE_STATUS_LABELS,
  formatReceiptNumber,
  formatSaleKes,
  orderSourceLabel,
  pipelineStepIndex,
} from "@/lib/sales";

export { formatSaleKes, formatReceiptNumber };

const SALE_STATUS_TONES = {
  draft: "bg-slate-100 text-slate-700 ring-slate-300/50",
  held: "bg-amber-50 text-amber-800 ring-amber-600/20",
  booked: "bg-blue-50 text-blue-800 ring-blue-600/20",
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  unpaid: "bg-rose-50 text-rose-800 ring-rose-600/20",
  pending_payment: "bg-orange-50 text-orange-800 ring-orange-600/20",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  processed: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
  delivered: "bg-teal-50 text-teal-800 ring-teal-600/20",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  cancelled: "bg-red-50 text-red-700 ring-red-600/20",
};

const PAYMENT_STATUS_TONES = {
  unpaid: "bg-amber-50 text-amber-800 ring-amber-600/20",
  partial: "bg-orange-50 text-orange-800 ring-orange-600/20",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
};

export function SaleStatusBadge({ status, workflow }) {
  const key = String(status ?? "draft").toLowerCase();
  const label = workflow
    ? workflowStatusLabel(workflow, key)
    : (SALE_STATUS_LABELS[key] ?? status ?? "—");
  const tone = SALE_STATUS_TONES[key] ?? SALE_STATUS_TONES.draft;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone}`}>
      {label}
    </span>
  );
}

export function PaymentStatusBadge({ status }) {
  const key = String(status ?? "unpaid").toLowerCase();
  const label = PAYMENT_STATUS_LABELS[key] ?? status ?? "—";
  const tone = PAYMENT_STATUS_TONES[key] ?? PAYMENT_STATUS_TONES.unpaid;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone}`}>
      {label}
    </span>
  );
}

const ORDER_SOURCE_TONES = {
  pos: "bg-violet-50 text-violet-800 ring-violet-600/20",
  mobile: "bg-sky-50 text-sky-800 ring-sky-600/20",
  backoffice: "bg-slate-100 text-slate-700 ring-slate-400/30",
  backend: "bg-slate-100 text-slate-700 ring-slate-400/30",
};

export function OrderSourceBadge({ source, channel, className = "" }) {
  const key = String(source ?? channel ?? "pos").toLowerCase();
  const label = orderSourceLabel(source, channel);
  const tone = ORDER_SOURCE_TONES[key] ?? ORDER_SOURCE_TONES.backend;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone} ${className}`}
      title="System that created this order"
    >
      {label}
    </span>
  );
}

export function HourlySalesChart({ points }) {
  if (!points?.length) {
    return (
      <div className="theme-subtext flex h-44 items-center justify-center text-sm">
        No sales recorded today yet.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.revenue ?? p.value ?? 0), 1);

  return (
    <div className="flex h-44 items-end gap-1 px-2">
      {points.map((p) => {
        const val = p.revenue ?? p.value ?? 0;
        return (
          <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[var(--theme-primary)]/80 transition-all"
              style={{ height: `${Math.max(6, (val / max) * 100)}%` }}
              title={`${p.label}:00 — ${formatSaleKes(val)} (${p.value ?? 0} orders)`}
            />
            <span className="theme-subtext truncate text-[9px]">
              {Number(p.label) % 3 === 0 ? p.label : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function OrderWorkflowPipeline({ status, onAdvance, busyStatus, workflow, orderSource, channel }) {
  const steps = workflowPipelineSteps(workflow);
  const currentIdx = pipelineStatusIndex(status, workflow);
  const displayIdx = currentIdx >= 0 ? currentIdx : pipelineStepIndex(status, workflow);
  const isCancelled = status === "cancelled";
  const prevStep = currentIdx > 0 ? steps[currentIdx - 1] : null;
  const nextStep = currentIdx >= 0 && currentIdx < steps.length - 1 ? steps[currentIdx + 1] : null;
  const firstStep = steps[0] ?? null;

  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-900">Order workflow</h3>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Created via</p>
          <OrderSourceBadge source={orderSource} channel={channel} className="mt-1" />
        </div>
      </div>
      {isCancelled ? (
        <p className="mt-3 text-sm text-red-600">This order was cancelled.</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-1">
            {steps.map((step, idx) => {
              const done = idx < displayIdx;
              const active = currentIdx >= 0 ? idx === currentIdx : idx === displayIdx;
              const upcoming = idx > displayIdx;
              return (
                <div key={step.key} className="flex min-w-0 flex-1 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`flex h-3 w-3 shrink-0 rounded-full ${
                        done || active ? "bg-[var(--theme-primary)]" : "bg-slate-200"
                      } ${active ? "ring-2 ring-[var(--theme-primary)]/30" : ""}`}
                    />
                    <span
                      className={`truncate text-center text-[10px] ${
                        upcoming ? "text-slate-400" : "text-slate-700"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 ? (
                    <div
                      className={`mx-0.5 mb-4 h-0.5 flex-1 ${
                        idx < displayIdx ? "bg-[var(--theme-primary)]" : "bg-slate-200"
                      }`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {onAdvance ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {prevStep ? (
                <button
                  type="button"
                  disabled={!!busyStatus}
                  onClick={() => onAdvance(prevStep.key)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busyStatus ? "Updating…" : `← ${prevStep.label}`}
                </button>
              ) : null}
              {nextStep ? (
                <button
                  type="button"
                  disabled={!!busyStatus}
                  onClick={() => onAdvance(nextStep.key)}
                  className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-50"
                >
                  {busyStatus ? "Updating…" : `${nextStep.label} →`}
                </button>
              ) : null}
              {(status === "held" || status === "draft") && firstStep ? (
                <button
                  type="button"
                  disabled={!!busyStatus}
                  onClick={() => onAdvance(firstStep.key)}
                  className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-50"
                >
                  {busyStatus ? "Updating…" : `${firstStep.label} →`}
                </button>
              ) : null}
              {status !== "cancelled" ? (
                <button
                  type="button"
                  disabled={!!busyStatus}
                  onClick={() => onAdvance("cancelled")}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel order
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ProductTile({ product, onSelect, disabled }) {
  const price = product.last_selling_price ?? product.unit_price ?? 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.(product)}
      className="flex flex-col theme-panel rounded-xl border p-4 text-left shadow-sm transition hover:border-[var(--theme-primary)]/40 hover:shadow disabled:opacity-50"
    >
      <p className="line-clamp-2 text-sm font-medium text-slate-900">
        {product.product_name}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--theme-primary)]">{formatSaleKes(price)}</p>
    </button>
  );
}
