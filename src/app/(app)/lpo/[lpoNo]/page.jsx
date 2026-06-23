"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { formatShortDate, IconButton, TrashIcon } from "@/components/catalog/catalog-shared";
import { openLpoSupplierInvoiceDocument } from "@/components/lpo/lpo-supplier-invoice-doc";
import { SupplierInvoiceModal } from "@/components/lpo/supplier-invoice-modal";
import {
  formatLpoKes,
  formatPoNumber,
  lpoCanRecordReturn,
  lpoIsCancelledReturned,
  LpoStatusBadge,
  LPO_STATUS,
} from "@/components/lpo/lpo-shared";
import { LpoDetailOrderItemsTable } from "@/components/lpo/lpo-detail-order-items";
import { LpoDetailActions, LpoWorkflowPanel } from "@/components/lpo/lpo-workflow";
import { LpoAttachmentsPanel } from "@/components/lpo/lpo-attachments-panel";
import { PaymentStatusBadge } from "@/components/suppliers/suppliers-shared";

export default function LpoDetailPage() {
  const params = useParams();
  const lpoNo = params.lpoNo;

  const [data, setData] = useState(null);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingLpo, setDeletingLpo] = useState(false);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [res, uomRes] = await Promise.all([
        apiRequest(`/lpo-mst/${lpoNo}/summary`),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setData(res);
      setUoms(uomRes.data ?? uomRes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPO");
    } finally {
      setLoading(false);
    }
  }, [lpoNo]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteLpo() {
    if (!confirm("Delete this purchase order? This cannot be undone.")) return;
    setDeletingLpo(true);
    setError(null);
    try {
      await apiRequest(`/lpo-mst/${lpoNo}`, { method: "DELETE" });
      window.location.href = "/lpo";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
      setDeletingLpo(false);
    }
  }

  async function deleteInvoice(id) {
    if (!confirm("Delete this supplier invoice?")) return;
    setDeletingId(id);
    try {
      await apiRequest(`/lpo-supplier-invoices/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const lpo = data?.lpo;
  const lines = data?.lines ?? [];
  const invoices = useMemo(
    () =>
      (data?.supplier_invoices ?? []).filter(
        (inv) => inv.id != null && Number(inv.lpo_no) === Number(lpoNo),
      ),
    [data?.supplier_invoices, lpoNo],
  );
  const supplierReturns = data?.supplier_returns ?? [];
  const canRecordReturn = lpo ? lpoCanRecordReturn(lpo, lines) : false;

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6">
        <Link href="/lpo" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to purchase orders
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-slate-900">
              {lpo ? formatPoNumber(lpo.lpo_no) : "Purchase order"}
            </h1>
            {lpo?.supplier_name ? (
              <p className="mt-0.5 text-sm text-slate-500">
                <Link href={`/suppliers/${lpo.supplier_id}`} className="text-[#185FA5] hover:underline">
                  {lpo.supplier_name}
                </Link>
              </p>
            ) : null}
          </div>
          {lpo ? (
            <div className="flex flex-wrap items-center gap-2">
              <LpoStatusBadge
                statusName={lpo.status_name}
                clearedFlag={lpo.cleared_flag}
                statusCode={lpo.lpo_status_code}
                paymentStatus={lpo.payment_status}
              />
              <LpoDetailActions
                lpo={lpo}
                lpoNo={lpoNo}
                onDelete={deleteLpo}
                deleting={deletingLpo}
              />
            </div>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : lpo ? (
        <div className="space-y-6">
          <LpoWorkflowPanel lpo={lpo} lpoNo={lpoNo} onUpdated={load} />
          <LpoAttachmentsPanel lpoNo={lpoNo} />

          {!lpo.can_edit ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              This LPO was sent to the supplier and can no longer be edited or deleted. Use workflow
              actions above or receive stock. Payments are allowed only after all items are received.
            </p>
          ) : null}
          {lpo.lpo_status_code >= 3 && Number(lpo.received_payable_total) > 0 ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Payable for received stock: {formatLpoKes(lpo.received_payable_total)} (LPO total{" "}
              {formatLpoKes(lpo.net_amount)}). You may pay partially as items are received.
            </p>
          ) : null}
          {lpoIsCancelledReturned(lpo) ? (
            <p className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              This LPO was cancelled because all order items were returned to the supplier. Receive
              stock and new returns are no longer available.
            </p>
          ) : null}

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">LPO details</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail
                label="Date created"
                value={
                  <span>
                    {lpo.created_by_name ? (
                      <span className="block font-medium text-slate-900">{lpo.created_by_name}</span>
                    ) : null}
                    <span className={lpo.created_by_name ? "text-slate-600" : ""}>
                      {lpo.order_date ? formatShortDate(lpo.order_date) : "—"}
                    </span>
                  </span>
                }
              />
              <Detail label="Due date" value={lpo.due_date ? formatShortDate(lpo.due_date) : "—"} />
              <Detail label="Your reference" value={lpo.reference_number} />
              <Detail label="Delivery" value={lpo.delivery_address} />
              <Detail label="Payable (received)" value={formatLpoKes(lpo.received_payable_total)} />
              <Detail label="Subtotal (Before VAT)" value={formatLpoKes(lpo.subtotal)} />
              <Detail label="VAT" value={formatLpoKes(lpo.vat_amount)} />
              <Detail
                label="Order total"
                value={
                  Number(lpo.return_credit_total) > 0 ? (
                    <span>
                      {formatLpoKes(lpo.adjusted_net_amount ?? lpo.net_amount)}
                      <span className="mt-0.5 block text-xs font-normal text-slate-500">
                        Was {formatLpoKes(lpo.net_amount)} · returns −{formatLpoKes(lpo.return_credit_total)}
                      </span>
                    </span>
                  ) : (
                    formatLpoKes(lpo.net_amount)
                  )
                }
                highlight
              />
              <Detail
                label="Paid"
                value={formatLpoKes(data.payments_total)}
                highlight={lpo.payment_status === "paid"}
              />
              <Detail label="Balance due" value={formatLpoKes(data.balance_due)} highlight />
              {data.payments_total > 0 ? (
                <Detail
                  label="Clearance"
                  value={
                    lpo.payment_status === "paid"
                      ? `Fully paid (${formatLpoKes(data.payments_total)} of ${formatLpoKes(lpo.received_payable_total)})`
                      : `Partially paid (${formatLpoKes(data.payments_total)} of ${formatLpoKes(lpo.received_payable_total)})`
                  }
                />
              ) : null}
              <Detail
                label="Pay status"
                value={<PaymentStatusBadge status={lpo.payment_status ?? "unpaid"} />}
              />
              <Detail label="Payment terms" value={lpo.terms} />
            </dl>
            {lpo.instructions ? (
              <p className="mt-4 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Notes for supplier: </span>
                {lpo.instructions}
              </p>
            ) : null}
          </section>

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Order items</h2>
            <LpoDetailOrderItemsTable
              lines={lines}
              uomById={uomById}
              lpo={lpo}
              lpoNo={lpoNo}
              supplierReturns={supplierReturns}
            />
          </section>

          <section className="rounded-xl border border-orange-200 bg-orange-50/30 p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Supplier returns</h2>
                <p className="text-xs text-slate-500">
                  Damaged or rejected goods returned to supplier — reduces stock and payable amount.
                </p>
              </div>
              {Number(lpo.lpo_status_code) >= LPO_STATUS.AWAITING_RECEIVE && canRecordReturn ? (
                <Link
                  href={`/lpo/${lpoNo}/supplier-return`}
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
                >
                  + Record supplier return
                </Link>
              ) : null}
            </div>
            {supplierReturns.length === 0 ? (
              <p className="text-sm text-slate-500">
                No supplier returns recorded yet.
                {canRecordReturn ? (
                  <>
                    {" "}
                    <Link href={`/lpo/${lpoNo}/supplier-return`} className="text-[#185FA5] hover:underline">
                      Record a return
                    </Link>{" "}
                    for damaged or rejected goods.
                  </>
                ) : null}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium">
                      <th className="px-3 py-2">Return</th>
                      <th className="px-3 py-2">Products</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2">Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierReturns.map((doc) => {
                      const lineSummary =
                        (doc.lines ?? [])
                          .map((l) => `${l.product_code} × ${l.quantity}`)
                          .join(", ") || "—";
                      const statusClass =
                        doc.status === "approved"
                          ? "bg-emerald-50 text-emerald-800"
                          : doc.status === "rejected"
                            ? "bg-red-50 text-red-800"
                            : "bg-amber-50 text-amber-900";
                      return (
                        <tr key={doc.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2.5 font-mono text-xs">#{doc.id}</td>
                          <td className="max-w-[280px] truncate px-3 py-2.5 text-slate-700" title={lineSummary}>
                            {lineSummary}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
                            >
                              {doc.status_label ?? doc.status}
                            </span>
                          </td>
                          <td
                            className="max-w-[200px] truncate px-3 py-2.5 text-slate-700"
                            title={doc.return_reason ?? doc.notes}
                          >
                            {doc.return_reason ?? doc.notes ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">{doc.created_at ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-violet-200 bg-violet-50/30 p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Supplier invoices</h2>
                <p className="text-xs text-slate-500">
                  Attach supplier invoice documents for audit — does not change the LPO total.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceModal({ mode: "new" })}
                className="text-sm font-medium text-[#185FA5] hover:underline"
              >
                + Add invoice
              </button>
            </div>
            {invoices.length === 0 ? (
              <p className="text-sm text-slate-500">No supplier invoices on this LPO yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium">
                      <th className="px-3 py-2">Supplier inv #</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Document</th>
                      <th className="px-3 py-2">Recorded</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2.5 font-medium">{inv.supplier_invoice_number}</td>
                        <td className="px-3 py-2.5">
                          {inv.invoice_date ? formatShortDate(inv.invoice_date) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {inv.has_document ? (
                            <button
                              type="button"
                              onClick={() => openLpoSupplierInvoiceDocument(inv.id)}
                              className="text-xs font-medium text-[#185FA5] hover:underline"
                            >
                              View PDF
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">No file</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{inv.received_at ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setInvoiceModal({ mode: "edit", invoice: inv })}
                              className="text-xs font-medium text-[#185FA5] hover:underline"
                            >
                              Edit
                            </button>
                            <IconButton
                              label="Delete"
                              onClick={() => deleteInvoice(inv.id)}
                              disabled={deletingId === inv.id}
                            >
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Supplier payments for this LPO appear under{" "}
            <Link href={`/suppliers/${lpo.supplier_id}?tab=payments`} className="text-[#185FA5] hover:underline">
              Supplier profile → Payments
            </Link>
            . Stock receipt posts inventory via Receive stock.
          </p>
        </div>
      ) : null}

      <SupplierInvoiceModal
        open={Boolean(invoiceModal)}
        onClose={() => setInvoiceModal(null)}
        onSaved={load}
        lpoNo={lpoNo}
        supplierId={lpo?.supplier_id}
        invoice={invoiceModal?.mode === "edit" ? invoiceModal.invoice : null}
      />
    </div>
  );
}

function Detail({ label, value, highlight }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 ${highlight ? "font-semibold text-slate-900" : "text-slate-800"}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
