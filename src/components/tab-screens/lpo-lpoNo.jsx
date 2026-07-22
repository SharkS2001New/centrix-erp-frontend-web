"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { formatShortDate, IconButton, TrashIcon } from "@/components/catalog/catalog-shared";
import { lpoSupplierInvoiceFilePath } from "@/components/lpo/lpo-supplier-invoice-doc";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";
import { SupplierInvoiceModal } from "@/components/lpo/supplier-invoice-modal";
import {
  formatLpoKes,
  lpoCanRecordReturn,
  lpoIsCancelledReturned,
  lpoDisplayNumber,
  LpoStatusBadge,
  LPO_STATUS,
} from "@/components/lpo/lpo-shared";
import { buildGrnFromLpoSummary } from "@/lib/grn-document";
import { LpoDetailOrderItemsTable } from "@/components/lpo/lpo-detail-order-items";
import { LpoDetailActions, LpoWorkflowPanel } from "@/components/lpo/lpo-workflow";
import { LpoAttachmentsPanel } from "@/components/lpo/lpo-attachments-panel";
import { PaymentStatusBadge } from "@/components/suppliers/suppliers-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";

export function LpoLpoNoScreen() {
  const params = useParams();
  const confirm = useConfirm();
  const { user } = useAuth();
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
    if (!lpoNo || lpoNo === "undefined" || Number.isNaN(Number(lpoNo))) {
      setError("Purchase order not found.");
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [res, uomsData] = await Promise.all([
        apiRequest(`/lpo-mst/${lpoNo}/summary`),
        fetchUomsCached(user?.organization_id),
      ]);
      setData(res);
      setUoms(uomsData ?? []);
      const resolvedNo = res?.lpo?.lpo_no;
      if (resolvedNo != null && String(resolvedNo) !== String(lpoNo)) {
        window.history.replaceState(null, "", `/lpo/${resolvedNo}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPO");
    } finally {
      setLoading(false);
    }
  }, [lpoNo, user?.organization_id]);

  useTabAwareDataLoad(load);

  async function deleteLpo() {
    const ok = await confirm(
      confirmDeleteOptions("this purchase order", "Delete this purchase order? This cannot be undone."),
    );
    if (!ok) return;
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
    const ok = await confirm(confirmDeleteOptions("this supplier invoice"));
    if (!ok) return;
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
  const grnReconciliation = useMemo(() => {
    if (!data?.lpo || !lines.some((line) => Number(line.received_qty ?? 0) > 0)) return null;
    return buildGrnFromLpoSummary(data, uomById).reconciliation;
  }, [data, lines, uomById]);
  const canRecordReturn = lpo ? lpoCanRecordReturn(lpo, lines) : false;
  const printContext = useMemo(
    () =>
      data
        ? {
            lpoSummary: data,
            uomById,
          }
        : null,
    [data, uomById],
  );

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Purchase orders", href: "/lpo" },
          {
            label: lpo ? lpoDisplayNumber(lpo) : "Purchase order",
          },
        ]}
      />
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="theme-heading text-xl font-medium">
              {lpo ? lpoDisplayNumber(lpo) : "Purchase order"}
            </h1>
            {lpo?.supplier_name ? (
              <p className="theme-subtext mt-0.5 text-sm">
                <Link href={`/suppliers/${lpo.supplier_id}`} className="theme-link hover:underline">
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
                printContext={printContext}
              />
            </div>
          ) : null}
        </div>
      </div>

      {error && (
        <p className="theme-alert-error mb-4 rounded-lg px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : lpo ? (
        <div className="space-y-6">
          <LpoWorkflowPanel
            lpo={lpo}
            lpoNo={lpoNo}
            onUpdated={load}
            printContext={printContext}
          />
          <LpoAttachmentsPanel lpoNo={lpoNo} />

          {!lpo.can_edit ? (
            <p className="theme-inset-panel rounded-lg border px-4 py-3 text-sm theme-subtext">
              This LPO was sent to the supplier and can no longer be edited or deleted. Use workflow
              actions above or receive items. Payments are allowed only after all items are received.
            </p>
          ) : null}
          {lpo.can_receive !== false &&
          Number(lpo.lpo_status_code) >= 2 &&
          Number(lpo.lpo_status_code) < 5 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--theme-accent-text)]">Ready to receive</p>
                <p className="text-sm theme-subtext">
                  Record received quantities against this purchase order and attach the supplier
                  invoice.
                </p>
              </div>
              <Link
                href={`/lpo/${lpoNo}/receive`}
                className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium"
              >
                Receive Items
              </Link>
            </div>
          ) : null}
          {lpo.lpo_status_code >= 3 && Number(lpo.received_payable_total) > 0 ? (
            <p className="rounded-lg border border-[var(--theme-primary)]/30 bg-[var(--theme-primary-muted)] px-4 py-3 text-sm text-[var(--theme-accent-text)]">
              Payable for received stock: {formatLpoKes(lpo.received_payable_total)} (LPO total{" "}
              {formatLpoKes(lpo.net_amount)}). You may pay partially as items are received.
            </p>
          ) : null}
          {grnReconciliation ? (
            <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <p className="font-medium text-slate-900">Goods received vs invoice</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">GRN received value</dt>
                  <dd className="font-medium">{formatLpoKes(grnReconciliation.grn_total)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Supplier invoice</dt>
                  <dd className="font-medium">
                    {grnReconciliation.supplier_invoice_amount != null
                      ? formatLpoKes(grnReconciliation.supplier_invoice_amount)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Variance</dt>
                  <dd className="font-medium">
                    {grnReconciliation.invoice_variance != null
                      ? formatLpoKes(grnReconciliation.invoice_variance)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Match status</dt>
                  <dd className="font-medium">{grnReconciliation.status}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {lpoIsCancelledReturned(lpo) ? (
            <p className="rounded-lg border border-[var(--theme-accent-orange)]/35 bg-[color-mix(in_srgb,var(--theme-accent-orange)_10%,var(--theme-page-bg))] px-4 py-3 text-sm text-[var(--theme-accent-text)]">
              This LPO was cancelled because all order items were returned to the supplier. Receive
              stock and new returns are no longer available.
            </p>
          ) : null}

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <h2 className="theme-heading mb-4 text-sm font-semibold">LPO details</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail
                label="Date created"
                value={
                  <span>
                    {lpo.created_by_name ? (
                      <span className="theme-heading block font-medium">{lpo.created_by_name}</span>
                    ) : null}
                    <span className={lpo.created_by_name ? "theme-subtext" : ""}>
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
                      <span className="mt-0.5 block text-xs font-normal theme-subtext">
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
              <p className="theme-subtext mt-4 text-sm">
                <span className="theme-heading font-medium">Notes for supplier: </span>
                {lpo.instructions}
              </p>
            ) : null}
          </section>

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <h2 className="theme-heading mb-4 text-sm font-semibold">Order items</h2>
            <LpoDetailOrderItemsTable
              lines={lines}
              uomById={uomById}
              lpo={lpo}
              lpoNo={lpoNo}
              supplierReturns={supplierReturns}
            />
          </section>

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="theme-heading text-sm font-semibold">Supplier returns</h2>
                <p className="theme-subtext text-xs">
                  Damaged or rejected goods returned to supplier — reduces stock and payable amount.
                </p>
              </div>
              {Number(lpo.lpo_status_code) >= LPO_STATUS.AWAITING_RECEIVE && canRecordReturn ? (
                <Link
                  href={`/lpo/${lpoNo}/supplier-return`}
                  className="theme-accent-btn rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  + Record supplier return
                </Link>
              ) : null}
            </div>
            {supplierReturns.length === 0 ? (
              <p className="theme-subtext text-sm">
                No supplier returns recorded yet.
                {canRecordReturn ? (
                  <>
                    {" "}
                    <Link href={`/lpo/${lpoNo}/supplier-return`} className="theme-link hover:underline">
                      Record a return
                    </Link>{" "}
                    for damaged or rejected goods.
                  </>
                ) : null}
              </p>
            ) : (
              <div className="theme-table-shell overflow-x-auto">
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
                        <tr key={doc.id} className="theme-table-body-row">
                          <td className="px-3 py-2.5 font-mono text-xs">#{doc.id}</td>
                          <td
                            className="max-w-[280px] truncate px-3 py-2.5"
                            title={lineSummary}
                          >
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
                            className="max-w-[200px] truncate px-3 py-2.5"
                            title={doc.return_reason ?? doc.notes}
                          >
                            {doc.return_reason ?? doc.notes ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 theme-subtext">{doc.created_at ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="theme-heading text-sm font-semibold">Supplier invoices</h2>
                <p className="theme-subtext text-xs">
                  Attach supplier invoice documents for audit — does not change the LPO total.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceModal({ mode: "new" })}
                className="theme-link text-sm font-medium hover:underline"
              >
                + Add invoice
              </button>
            </div>
            {invoices.length === 0 ? (
              <p className="theme-subtext text-sm">No supplier invoices on this LPO yet.</p>
            ) : (
              <div className="theme-table-shell overflow-x-auto">
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
                      <tr key={inv.id} className="theme-table-body-row">
                        <td className="px-3 py-2.5 font-medium">{inv.supplier_invoice_number}</td>
                        <td className="px-3 py-2.5">
                          {inv.invoice_date ? formatShortDate(inv.invoice_date) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {inv.has_document ? (
                            <ProtectedFileLink
                              filePath={lpoSupplierInvoiceFilePath(inv.id)}
                              label="View PDF"
                              title={`Supplier invoice ${inv.supplier_invoice_number}`}
                              className="text-xs"
                            />
                          ) : (
                            <span className="theme-subtext text-xs">No file</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 theme-subtext">{inv.received_at ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setInvoiceModal({ mode: "edit", invoice: inv })}
                              className="theme-link text-xs font-medium hover:underline"
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

          <p className="theme-subtext text-xs">
            Supplier payments for this LPO appear under{" "}
            <Link
              href={`/suppliers/${lpo.supplier_id}?tab=payments`}
              className="theme-link hover:underline"
            >
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
      <dt className="text-xs font-medium uppercase tracking-wide theme-subtext">{label}</dt>
      <dd className={`mt-0.5 ${highlight ? "theme-heading font-semibold" : ""}`}>
        {value ?? "—"}
      </dd>
    </div>
  );
}
