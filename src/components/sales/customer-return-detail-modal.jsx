"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import {
  ReturnStatusBadge,
  customerReturnLineQtyLabel,
  isReturnPending,
  normalizeReturnStatus,
  refundMethodLabel,
  stockLocationLabel,
} from "@/components/sales/customer-returns-shared";

export function CustomerReturnDetailModal({
  open,
  row,
  busy,
  onClose,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onPrint,
  error,
  successMessage,
}) {
  const [mounted, setMounted] = useState(false);
  const [uoms, setUoms] = useState([]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    apiRequest("/uoms", { searchParams: { per_page: 200 } })
      .then((res) => setUoms(res.data ?? []))
      .catch(() => setUoms([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted || !row) return null;

  const customerName =
    row.customer?.customer_name ?? row.sale?.customer_name_override ?? "Walk-in customer";
  const pending = isReturnPending(row.status);
  const approved = normalizeReturnStatus(row.status) === "approved";
  const approverName =
    row.approved_by_user?.full_name ??
    row.approvedByUser?.full_name ??
    row.approved_by_user?.username ??
    row.approvedByUser?.username ??
    null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Return details</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{row.return_no}</h2>
          </div>
          <div className="flex items-center gap-2">
            <ReturnStatusBadge status={row.status} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {successMessage ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {successMessage}
            </p>
          ) : null}

          <DetailRow
            label="Invoice no."
            value={
              row.sale_id ? (
                <Link
                  href={`/sales/orders/${row.sale_id}`}
                  className="font-medium text-[var(--theme-primary)] hover:underline"
                >
                  {row.sale ? formatReceiptNumber(row.sale) : `#${row.sale_id}`}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <DetailRow
            label="Customer"
            value={
              row.customer_num ? (
                <Link
                  href={`/customers/${row.customer_num}`}
                  className="font-medium text-[var(--theme-primary)] hover:underline"
                >
                  {customerName}
                </Link>
              ) : (
                customerName
              )
            }
          />
          <DetailRow
            label="Date created"
            value={
              row.created_at
                ? new Date(row.created_at).toLocaleString("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : formatShortDate(row.return_date)
            }
          />
          <DetailRow label="Return date" value={formatShortDate(row.return_date)} />
          <DetailRow label="Refund method" value={refundMethodLabel(row.refund_method)} />
          <DetailRow label="Restock location" value={stockLocationLabel(row.stock_location)} />
          <DetailRow label="Reason" value={row.reason ?? "—"} />
          {approved ? (
            <>
              <DetailRow
                label="Credit note"
                value={
                  row.credit_note?.credit_note_no ?? row.creditNote?.credit_note_no ?? "—"
                }
              />
              {(row.credit_note?.kra_status ?? row.creditNote?.kra_status) === "success" ? (
                <DetailRow
                  label="KRA credit note"
                  value={
                    row.credit_note?.kra_cu_inv_no ??
                    row.creditNote?.kra_cu_inv_no ??
                    row.credit_note?.kra_invoice_number ??
                    row.creditNote?.kra_invoice_number ??
                    "Fiscalized"
                  }
                />
              ) : null}
              {(row.credit_note?.kra_status ?? row.creditNote?.kra_status) === "failed" ? (
                <DetailRow
                  label="KRA credit note"
                  value={
                    <span className="text-red-700">
                      {row.credit_note?.kra_error_message ??
                        row.creditNote?.kra_error_message ??
                        "Submission failed"}
                    </span>
                  }
                />
              ) : null}
              <DetailRow
                label="Approved"
                value={
                  row.approved_at
                    ? new Date(row.approved_at).toLocaleString("en-KE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"
                }
              />
              {approverName ? <DetailRow label="Approved by" value={approverName} /> : null}
              <DetailRow
                label="Stock restored"
                value={
                  <Link
                    href={`/inventory/transactions?type=RETURN&reference_id=${row.id}`}
                    className="font-medium text-[var(--theme-primary)] hover:underline"
                  >
                    View inventory movements
                  </Link>
                }
              />
            </>
          ) : null}
          {row.notes ? <DetailRow label="Notes" value={row.notes} /> : null}
          {row.reject_reason ? <DetailRow label="Reject reason" value={row.reject_reason} /> : null}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Returned items</p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.lines ?? []).map((line) => (
                    <tr key={line.id ?? line.product_code} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{line.product_name ?? line.product_code}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {customerReturnLineQtyLabel(line, uomById, "return_qty")}
                      </td>
                      <td className="px-3 py-2 text-right">{formatSaleKes(line.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatSaleKes(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg bg-violet-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-violet-900">Total refund</span>
              <span className="text-lg font-semibold text-violet-900">{formatSaleKes(row.total_amount)}</span>
            </div>
          </div>
        </div>

        {error ? (
          <p className="border-t border-slate-100 px-5 py-2 text-sm text-red-600">{error}</p>
        ) : null}

        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4">
          {pending ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onApprove?.(row)}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Approve return
              </button>
              <button
                type="button"
                onClick={() => onReject?.(row)}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                Reject return
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPrint?.(row)}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {approved ? "Print credit note" : "Print"}
            </button>
            {pending ? (
              <button
                type="button"
                onClick={() => onEdit?.(row)}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDelete?.(row)}
              disabled={busy}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
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
