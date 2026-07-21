"use client";

import { formatLpoKes } from "@/components/lpo/lpo-shared";

export function LpoReceiveSessionFooter({ sessionTotal, supplierInvoice }) {
  const invoiceAmount =
    supplierInvoice?.invoice_amount != null && supplierInvoice.invoice_amount !== ""
      ? Number(supplierInvoice.invoice_amount)
      : null;
  const hasReceiving = Number(sessionTotal ?? 0) > 0;
  const variance =
    invoiceAmount != null && hasReceiving
      ? Math.round((Number(sessionTotal) - invoiceAmount) * 100) / 100
      : null;

  if (!hasReceiving && invoiceAmount == null) return null;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Total for this receiving
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
          {formatLpoKes(sessionTotal ?? 0)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Sum of line totals (paid qty × unit cost). Compare with the supplier invoice.
        </p>
      </div>
      {invoiceAmount != null ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Supplier invoice total
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
            {formatLpoKes(invoiceAmount)}
          </p>
          {variance != null ? (
            <p
              className={`mt-1 text-sm font-medium tabular-nums ${
                Math.abs(variance) <= 1
                  ? "text-emerald-700"
                  : variance > 0
                    ? "text-amber-700"
                    : "text-red-700"
              }`}
            >
              {Math.abs(variance) <= 1
                ? "Matches invoice (within KES 1)"
                : variance > 0
                  ? `${formatLpoKes(variance)} over invoice`
                  : `${formatLpoKes(Math.abs(variance))} under invoice`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
