"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  ReturnStatusBadge,
  refundMethodLabel,
} from "@/components/sales/customer-returns-shared";

export function LegacyReturnDetailModal({
  open,
  row,
  loading = false,
  onClose,
  onPrint,
  error,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape" && !loading) onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onClose, open]);

  if (!open || !mounted) return null;

  const creditNote = row?.credit_note ?? row?.creditNote;
  const customerName =
    row?.customer?.customer_name ?? row?.sale?.customer_name_override ?? "Walk-in customer";
  const canPrint = row?.status === "approved" && Boolean(creditNote);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="theme-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Legacy return</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {row?.return_no ?? "Loading…"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {row?.status ? <ReturnStatusBadge status={row.status} /> : null}
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {loading ? (
            <p className="text-slate-500">Loading return details…</p>
          ) : row ? (
            <>
              <DetailRow
                label="Legacy order"
                value={
                  row.sale_id ? (
                    <Link
                      href={`/sales/legacy-orders?sale_id=${row.sale_id}`}
                      className="font-medium text-[var(--theme-primary)] hover:underline"
                    >
                      {row.sale ? formatReceiptNumber(row.sale) : `#${row.sale_id}`}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <DetailRow label="Customer" value={customerName} />
              <DetailRow label="Return date" value={formatShortDate(row.return_date)} />
              <DetailRow label="Refund method" value={refundMethodLabel(row.refund_method)} />
              <DetailRow label="Reason" value={row.reason ?? "—"} />
              {creditNote ? (
                <>
                  <DetailRow label="Credit note" value={creditNote.credit_note_no ?? "—"} />
                  <DetailRow
                    label="KRA status"
                    value={
                      creditNote.kra_status === "success"
                        ? creditNote.kra_cu_inv_no ??
                          creditNote.kra_invoice_number ??
                          "Fiscalized"
                        : creditNote.kra_status === "failed"
                          ? "Failed"
                          : creditNote.kra_status ?? "—"
                    }
                  />
                </>
              ) : null}
              {creditNote?.kra_status === "failed" && creditNote?.kra_error_message ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  KRA device error: {creditNote.kra_error_message}
                </p>
              ) : null}
              {row.notes ? <DetailRow label="Notes" value={row.notes} /> : null}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Returned items
                </p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(row.lines ?? []).map((line) => (
                        <tr key={line.id ?? line.product_code} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {line.product_name ?? line.product_code}
                          </td>
                          <td className="px-3 py-2 text-right">{line.return_qty}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatSaleKes(line.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg bg-violet-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-violet-900">Credit amount</span>
                  <span className="text-lg font-semibold text-violet-900">
                    {formatSaleKes(row.total_amount)}
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {error && !loading ? (
          <p className="border-t border-slate-100 px-5 py-2 text-sm text-red-600">{error}</p>
        ) : null}

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
          <div className="flex flex-wrap justify-end gap-2">
            {canPrint ? (
              <button
                type="button"
                onClick={() => onPrint?.(row)}
                disabled={loading}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Print credit note
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 text-slate-800">{value}</div>
    </div>
  );
}
