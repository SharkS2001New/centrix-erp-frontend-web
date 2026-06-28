"use client";

import { notifyError } from "@/lib/notify";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isAdminUser } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  PencilIcon,
  SearchInput,
  TrashIcon,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { SUPPLIER_RETURN_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { formatPoNumber } from "@/components/lpo/lpo-shared";
import { printSupplierReturn } from "@/components/suppliers/supplier-return-print";
import { formatReturnQty, formatStockLocationLabel, statusBadgeClass } from "@/components/suppliers/supplier-return-shared";

const PAGE_SIZE = 15;

const COLS = [
  { key: "toggle", label: "", className: "w-10 px-2" },
  { key: "returnNo", label: "Return no.", className: "w-24 px-3" },
  { key: "supplier", label: "Supplier name", className: "min-w-[140px] px-3" },
  { key: "lpo", label: "LPO no.", className: "w-24 px-3" },
  { key: "invoice", label: "Supplier inv. no.", className: "w-32 px-3" },
  { key: "returnedBy", label: "Returned by", className: "w-32 px-3" },
  { key: "reason", label: "Return reason", className: "min-w-[160px] max-w-[220px] px-3" },
  { key: "status", label: "Status", className: "w-28 px-3" },
  { key: "actions", label: "Actions", className: "w-28 px-3 text-right" },
];

const COL = Object.fromEntries(COLS.map((c) => [c.key, c]));

function isOrderLevelReason(row) {
  return (row.reason_scope ?? "order") === "order";
}

function returnReferenceLabel(row) {
  if (row.lpo_no) return "LPO";
  if (row.source_type === "lpo") return "LPO";
  return "Manual";
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function IconActionButton({ label, onClick, disabled, className, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function ReturnActionDialog({
  open,
  type,
  row,
  rejectReason,
  onRejectReasonChange,
  saving,
  error,
  onClose,
  onConfirm,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || !row) return null;

  const config =
    type === "approve"
      ? {
          title: "Approve supplier return?",
          message: `Approve return #${row.id}? Stock will be deducted for received quantities when applicable.`,
          confirmLabel: "Approve return",
          confirmClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
        }
      : type === "reject"
        ? {
            title:
              row.status === "approved"
                ? "Reject approved return?"
                : "Reject supplier return?",
            message:
              row.status === "approved"
                ? `Reject return #${row.id}? Stock that was deducted will be restored.`
                : `Reject return #${row.id}? No stock will be adjusted.`,
            confirmLabel: "Reject return",
            confirmClass: "bg-red-600 hover:bg-red-700 text-white",
          }
        : type === "delete"
          ? {
              title:
                row.status === "approved"
                  ? "Delete approved return?"
                  : "Delete supplier return?",
              message:
                row.status === "approved"
                  ? `Delete return #${row.id}? Stock that was deducted will be restored. This cannot be undone.`
                  : `Delete return #${row.id}? This cannot be undone.`,
              confirmLabel: "Delete return",
              confirmClass: "bg-red-600 hover:bg-red-700 text-white",
            }
          : null;

  if (!config) return null;

  const rejectInvalid = type === "reject" && rejectReason.trim().length < 3;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-action-dialog-title"
        className="w-full max-w-md theme-panel rounded-xl border p-5 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !saving) onClose();
        }}
      >
        <h2 id="return-action-dialog-title" className="text-[15px] font-medium text-slate-900">
          {config.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{config.message}</p>

        {type === "reject" ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Reason for rejection (required)
            </span>
            <textarea
              rows={3}
              className={inputClassName()}
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              placeholder="Explain why this return is rejected"
            />
          </label>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-4 flex gap-2 border-t border-slate-200 pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || rejectInvalid}
            onClick={onConfirm}
            className={`flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${config.confirmClass}`}
          >
            {saving ? "Working…" : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReturnOrderActions({ row, busyId, onRequestAction, onPrint }) {
  const disabled = busyId === row.id;
  const hasActions =
    row.can_approve || row.can_reject || row.can_delete || row.can_edit || onPrint;

  if (!hasActions) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {onPrint ? (
        <IconActionButton
          label="Print return"
          disabled={disabled}
          onClick={() => onPrint(row)}
          className="text-slate-700 hover:bg-slate-100"
        >
          <PrintIcon />
        </IconActionButton>
      ) : null}
      {row.can_approve ? (
        <IconActionButton
          label="Approve return"
          disabled={disabled}
          onClick={() => onRequestAction("approve", row)}
          className="text-emerald-700 hover:bg-emerald-50"
        >
          <CheckCircleIcon />
        </IconActionButton>
      ) : null}
      {row.can_reject ? (
        <IconActionButton
          label={row.status === "approved" ? "Reject (undo approval)" : "Reject return"}
          disabled={disabled}
          onClick={() => onRequestAction("reject", row)}
          className="text-red-700 hover:bg-red-50"
        >
          <XCircleIcon />
        </IconActionButton>
      ) : null}
      {row.can_edit ? (
        <Link
          href={`/suppliers/returns/${row.id}/edit`}
          title="Edit return"
          aria-label="Edit return"
          className="rounded-md p-1.5 text-[#185FA5] transition-colors hover:bg-[#E6F1FB]"
        >
          <PencilIcon />
        </Link>
      ) : null}
      {row.can_delete ? (
        <IconActionButton
          label="Delete return"
          disabled={disabled}
          onClick={() => onRequestAction("delete", row)}
          className="text-slate-600 hover:bg-slate-100"
        >
          <TrashIcon />
        </IconActionButton>
      ) : null}
    </div>
  );
}

function LineItemsTable({ row }) {
  const lines = row.lines ?? [];
  const perProductReason = !isOrderLevelReason(row);

  if (lines.length === 0) {
    return <p className="text-sm text-slate-500">No products on this return.</p>;
  }

  return (
    <div className="theme-table-shell overflow-x-auto rounded-lg border border-[var(--theme-border)]">
      <table className="theme-table w-full min-w-[560px] border-collapse text-xs">
        <thead>
          <tr className="theme-table-head-row text-left font-medium">
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2 text-right">Qty to return</th>
            <th className="px-3 py-2">From</th>
            <th className="px-3 py-2">Package</th>
            {perProductReason ? <th className="px-3 py-2">Return reason</th> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id ?? `${line.product_code}-${line.stock_location}`} className="theme-table-body-row border-b border-[var(--theme-border)]">
              <td className="px-3 py-2">
                <span className="font-medium theme-heading">{line.product_name}</span>
                <span className="theme-subtext block font-mono text-[10px]">{line.product_code}</span>
              </td>
              <td className="px-3 py-2 text-right font-medium">{formatReturnQty(line.quantity)}</td>
              <td className="px-3 py-2 capitalize theme-text">
                {formatStockLocationLabel(line.stock_location, line)}
              </td>
              <td className="px-3 py-2 theme-text">
                {line.package_type_label ?? line.package_type}
              </td>
              {perProductReason ? (
                <td className="max-w-[260px] px-3 py-2 theme-subtext">{line.reason ?? "—"}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SupplierReturnsPage() {
  const { user, organization, generalSettings } = useAuth();
  const searchParams = useSearchParams();
  const presetSupplier = searchParams.get("supplier_id") ?? searchParams.get("supplier");

  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogError, setDialogError] = useState(null);
  const [supplierFilter, setSupplierFilter] = useState(presetSupplier ?? "all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const listParams = { per_page: 200 };
      if (supplierFilter !== "all") listParams.supplier_id = supplierFilter;
      if (statusFilter !== "all") listParams.status = statusFilter;
      if (dateFrom) listParams.date_from = dateFrom;
      if (dateTo) listParams.date_to = dateTo;

      const [retRes, supRes] = await Promise.all([
        apiRequest("/supplier-return-documents", { searchParams: listParams }),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      ]);
      setRows(retRes.data ?? []);
      setSuppliers(supRes.data ?? []);
      setCollapsedIds(new Set());
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load returns");
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (presetSupplier) setSupplierFilter(presetSupplier);
  }, [presetSupplier]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter === "manual") list = list.filter((r) => r.source_type === "manual");
    else if (typeFilter === "lpo") list = list.filter((r) => r.source_type === "lpo");

    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = [
        r.supplier_name,
        r.return_reason,
        r.notes,
        r.supplier_invoice_no,
        r.reference,
        r.returned_by_name,
        String(r.id),
        returnReferenceLabel(r),
        r.lpo_no != null ? `lpo ${r.lpo_no}` : "",
        ...(r.lines ?? []).flatMap((l) => [l.product_name, l.product_code, l.reason]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, typeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, supplierFilter, typeFilter, statusFilter, dateFrom, dateTo]);

  function toggleCollapsed(id) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openActionDialog(type, row) {
    setDialogError(null);
    setRejectReason("");
    setDialog({ type, row });
  }

  function closeActionDialog() {
    if (busyId) return;
    setDialog(null);
    setDialogError(null);
    setRejectReason("");
  }

  async function confirmDialogAction() {
    if (!dialog?.row) return;
    const { type, row } = dialog;
    setDialogError(null);

    if (type === "reject" && rejectReason.trim().length < 3) {
      setDialogError("Enter a rejection reason (at least 3 characters).");
      return;
    }

    setBusyId(row.id);
    try {
      if (type === "approve") {
        await apiRequest(`/supplier-return-documents/${row.id}/approve`, { method: "POST" });
      } else if (type === "reject") {
        await apiRequest(`/supplier-return-documents/${row.id}/reject`, {
          method: "POST",
          body: { rejection_reason: rejectReason.trim() },
        });
      } else if (type === "delete") {
        await apiRequest(`/supplier-return-documents/${row.id}`, { method: "DELETE" });
      }
      setDialog(null);
      setRejectReason("");
      await loadData();
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const handlePrint = useCallback(
    async (row) => {
      try {
        await printSupplierReturn(row, {
          organization,
          generalSettings: generalSettings(),
          printedBy: user?.full_name ?? user?.username ?? null,
        });
      } catch (e) {
        notifyError(e instanceof Error ? e.message : "Failed to print return");
      }
    },
    [generalSettings, organization, user],
  );

  const pendingCount = filtered.filter((r) => r.status === "pending_approval").length;
  const adminHint = isAdminUser(user) ? null : " Approve/reject requires a senior (admin) user.";

  return (
    <CatalogPageShell
      title="Supplier returns"
      subtitle="Returns to suppliers — each order is tied to one supplier"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Supplier returns"
            filename="supplier-returns"
            apiPath="/supplier-return-documents"
            columns={SUPPLIER_RETURN_EXPORT_COLUMNS}
            totalCount={filtered.length}
            getSearchParams={() => {
              const params = { per_page: 200 };
              if (supplierFilter !== "all") params["filter[supplier_id]"] = supplierFilter;
              if (statusFilter !== "all") params["filter[status]"] = statusFilter;
              return params;
            }}
            disabled={loading}
          />
          <Link
          href={
            supplierFilter !== "all"
              ? `/suppliers/returns/new?supplier_id=${supplierFilter}&return=returns`
              : "/suppliers/returns/new?return=returns"
          }
          className="inline-flex items-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          Record return
        </Link>
        </div>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search return, supplier, invoice, product…"
          />
          <FilterSelect
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            options={[
              { value: "all", label: "All suppliers" },
              ...suppliers.map((s) => ({
                value: String(s.id),
                label: s.supplier_name,
              })),
            ]}
          />
          <FilterSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: "all", label: "All types" },
              { value: "manual", label: "Manual only" },
              { value: "lpo", label: "From LPO only" },
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "pending_approval", label: "Pending approval" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
          <label className="block text-xs text-slate-500">
            <span className="mb-1 block font-medium">From date</span>
            <input
              type="date"
              className={inputClassName()}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block text-xs text-slate-500">
            <span className="mb-1 block font-medium">To date</span>
            <input
              type="date"
              className={inputClassName()}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear dates
            </button>
          )}
        </div>
      }
    >
      {!loading && (
        <p className="mb-4 text-sm text-slate-600">
          Showing {filtered.length} return{filtered.length === 1 ? "" : "s"}
          {pendingCount > 0 ? ` · ${pendingCount} awaiting approval` : ""}
          {adminHint ?? ""}
          {" · "}
          Products expanded by default — use − to collapse
        </p>
      )}

      <ReturnActionDialog
        open={Boolean(dialog)}
        type={dialog?.type}
        row={dialog?.row}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        saving={Boolean(busyId)}
        error={dialogError}
        onClose={closeActionDialog}
        onConfirm={confirmDialogAction}
      />

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading returns…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            No supplier returns found.{" "}
            <Link href="/suppliers/returns/new" className="text-[#185FA5] hover:underline">
              Record one
            </Link>
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
                <thead className="theme-table-head-row text-left text-xs font-medium">
                  <tr>
                    {COLS.map((col) => (
                      <th
                        key={col.key}
                        className={`py-2.5 align-bottom ${col.className} ${
                          col.key === "actions" ? "text-right" : "text-left"
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((row) => {
                    const collapsed = collapsedIds.has(row.id);
                    const orderReason = isOrderLevelReason(row);

                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b border-[var(--theme-border)] theme-table-body-row">
                          <td className={`${COL.toggle.className} py-3 align-top`}>
                            <button
                              type="button"
                              onClick={() => toggleCollapsed(row.id)}
                              className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                              aria-expanded={!collapsed}
                            >
                              {collapsed ? "+" : "−"}
                            </button>
                          </td>
                          <td className={`${COL.returnNo.className} py-3 align-top`}>
                            <span className="font-mono text-sm font-semibold text-slate-900">
                              {row.id}
                            </span>
                            <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                              {returnReferenceLabel(row)}
                            </span>
                          </td>
                          <td className={`${COL.supplier.className} py-3 align-top`}>
                            <Link
                              href={`/suppliers/${row.supplier_id}`}
                              className="theme-link font-medium hover:underline"
                            >
                              {row.supplier_name ?? "—"}
                            </Link>
                          </td>
                          <td className={`${COL.lpo.className} py-3 align-top`}>
                            {row.lpo_no ? (
                              <Link
                                href={`/lpo/${row.lpo_no}`}
                                className="theme-link font-mono hover:underline"
                              >
                                {formatPoNumber(row.lpo_no, row.lpo_order_date)}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={`${COL.invoice.className} py-3 align-top text-slate-700`}>
                            {row.supplier_invoice_no ? (
                              <span
                                className="block truncate text-xs leading-snug text-slate-700"
                                title={row.supplier_invoice_no}
                              >
                                {row.supplier_invoice_no}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={`${COL.returnedBy.className} py-3 align-top`}>
                            <span className="block text-slate-800">{row.returned_by_name ?? "—"}</span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {row.created_at ? formatShortDate(row.created_at.slice(0, 10)) : "—"}
                            </span>
                          </td>
                          <td className={`${COL.reason.className} py-3 align-top text-slate-700`}>
                            {orderReason ? (
                              <span className="line-clamp-2" title={row.return_reason ?? row.notes}>
                                {row.return_reason ?? row.notes ?? "—"}
                              </span>
                            ) : (
                              <span className="text-xs italic text-slate-400">See products below</span>
                            )}
                          </td>
                          <td className={`${COL.status.className} py-3 align-top`}>
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(row.status)}`}
                            >
                              {row.status_label ?? row.status}
                            </span>
                          </td>
                          <td className={`${COL.actions.className} py-3 align-top`}>
                            <ReturnOrderActions
                              row={row}
                              busyId={busyId}
                              onRequestAction={openActionDialog}
                              onPrint={handlePrint}
                            />
                          </td>
                        </tr>
                        {!collapsed ? (
                          <tr className="border-b border-[var(--theme-border)] bg-[var(--theme-primary-muted)]">
                            <td colSpan={COLS.length} className="px-4 py-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-primary)]">
                                Items / products returned ({(row.lines ?? []).length})
                              </p>
                              <LineItemsTable row={row} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </CatalogPageShell>
  );
}
