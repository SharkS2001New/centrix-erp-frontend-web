"use client";

import {
  ORDER_PIPELINE_STEPS,
  PAYMENT_STATUS_LABELS,
  SALE_STATUS_LABELS,
  formatReceiptNumber,
  formatSaleKes,
  pipelineStepIndex,
} from "@/lib/sales";

export { formatSaleKes, formatReceiptNumber };

const SALE_STATUS_TONES = {
  draft: "bg-slate-100 text-slate-700 ring-slate-300/50",
  held: "bg-amber-50 text-amber-800 ring-amber-600/20",
  booked: "bg-blue-50 text-blue-800 ring-blue-600/20",
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  pending_payment: "bg-orange-50 text-orange-800 ring-orange-600/20",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  processed: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  cancelled: "bg-red-50 text-red-700 ring-red-600/20",
};

const PAYMENT_STATUS_TONES = {
  unpaid: "bg-amber-50 text-amber-800 ring-amber-600/20",
  partial: "bg-orange-50 text-orange-800 ring-orange-600/20",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
};

export function SaleStatusBadge({ status }) {
  const key = String(status ?? "draft").toLowerCase();
  const label = SALE_STATUS_LABELS[key] ?? status ?? "—";
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

export function HourlySalesChart({ points }) {
  if (!points?.length) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-slate-500">
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
              className="w-full rounded-t bg-[#185FA5]/80 transition-all"
              style={{ height: `${Math.max(6, (val / max) * 100)}%` }}
              title={`${p.label}:00 — ${formatSaleKes(val)} (${p.value ?? 0} orders)`}
            />
            <span className="truncate text-[9px] text-slate-500">
              {Number(p.label) % 3 === 0 ? p.label : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function OrderWorkflowPipeline({ status, onAdvance, busyStatus }) {
  const currentIdx = pipelineStepIndex(status);
  const isCancelled = status === "cancelled";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-slate-900">Order workflow</h3>
      {isCancelled ? (
        <p className="mt-3 text-sm text-red-600">This order was cancelled.</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-1">
            {ORDER_PIPELINE_STEPS.map((step, idx) => {
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              const upcoming = idx > currentIdx;
              return (
                <div key={step.key} className="flex min-w-0 flex-1 items-center">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`flex h-3 w-3 shrink-0 rounded-full ${
                        done || active ? "bg-[#185FA5]" : "bg-slate-200"
                      } ${active ? "ring-2 ring-[#185FA5]/30" : ""}`}
                    />
                    <span
                      className={`truncate text-center text-[10px] ${
                        upcoming ? "text-slate-400" : "text-slate-700"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < ORDER_PIPELINE_STEPS.length - 1 ? (
                    <div
                      className={`mx-0.5 mb-4 h-0.5 flex-1 ${
                        idx < currentIdx ? "bg-[#185FA5]" : "bg-slate-200"
                      }`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {onAdvance ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {ORDER_PIPELINE_STEPS.slice(currentIdx + 1, currentIdx + 2).map((step) => (
                <button
                  key={step.key}
                  type="button"
                  disabled={!!busyStatus}
                  onClick={() => onAdvance(step.key)}
                  className="rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {busyStatus ? "Updating…" : `Mark ${step.label}`}
                </button>
              ))}
              {status !== "cancelled" && (
                <button
                  type="button"
                  disabled={!!busyStatus}
                  onClick={() => onAdvance("cancelled")}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel order
                </button>
              )}
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
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#185FA5]/40 hover:shadow disabled:opacity-50"
    >
      <p className="line-clamp-2 text-sm font-medium text-slate-900">
        {product.product_name}
      </p>
      <p className="mt-2 text-sm font-semibold text-[#185FA5]">{formatSaleKes(price)}</p>
    </button>
  );
}
