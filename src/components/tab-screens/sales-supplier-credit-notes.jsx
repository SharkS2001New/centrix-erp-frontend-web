"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useListRefreshUi } from "@/lib/list-refresh-ui";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  FILTER_CONTROL_CLASS,
  FilterSelect,
  FilterToolbar,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { canApproveSupplierReturns } from "@/lib/approval-permissions";
import { CreditNotesTabs } from "@/components/sales/credit-notes-tabs";
import { ReturnStatusBadge } from "@/components/sales/customer-returns-shared";
import { formatSaleKes } from "@/lib/sales";
import { defaultDateRange } from "@/lib/datetime";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { SupplierCreditNoteRowActions } from "@/components/suppliers/supplier-credit-note-actions";

function mapSupplierStatus(status) {
  if (status === "pending_approval") return "pending";
  return status;
}

export function SalesSupplierCreditNotesScreen() {
  const { hasPermission, capabilities } = useAuth();
  const canManage = canApproveSupplierReturns({ hasPermission, capabilities });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const defaultRange = useMemo(() => defaultDateRange(30), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogError, setDialogError] = useState(null);

  const loadData = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: {
          status: statusFilter !== "all" ? statusFilter : undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        },
      });
      const res = await apiRequest("/supplier-credit-notes", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load supplier credit notes");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, fromDate, toDate]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, fromDate, toDate]);

  const safePage = Math.min(page, totalPages);
  const listRefresh = useListRefreshUi({
    loading,
    listLoading,
    hasRows: rows.length > 0,
  });
  const tableLoading = listRefresh.showInitialLoading;

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
        await apiRequest(`/supplier-credit-notes/${row.id}/approve`, { method: "POST" });
        notifySuccess(`${row.credit_note_no} approved.`);
      } else if (type === "reject") {
        await apiRequest(`/supplier-credit-notes/${row.id}/reject`, {
          method: "POST",
          body: { reason: rejectReason.trim() },
        });
        notifySuccess(`${row.credit_note_no} rejected.`);
      } else if (type === "delete") {
        await apiRequest(`/supplier-credit-notes/${row.id}`, { method: "DELETE" });
        notifySuccess(`${row.credit_note_no} deleted.`);
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

  return (
    <div className="theme-workspace min-h-full">
      <CreditNotesTabs active="supplier" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Supplier credit notes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Credits received from suppliers for overcharges or billing errors. Products are optional.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <PrimaryLink href="/sales/credit-notes/supplier/new">Create supplier credit note</PrimaryLink>
        </div>
      </div>

      <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <FilterToolbar className="mb-0 border-b border-slate-100 p-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search credit note, supplier, reason…"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "Status: All" },
              { value: "pending_approval", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={FILTER_CONTROL_CLASS}
            aria-label="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={FILTER_CONTROL_CLASS}
            aria-label="To date"
          />
        </FilterToolbar>

        {error ? <p className="px-4 py-3 text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="theme-table-head-row text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Credit note no.</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="w-36 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={listRefresh.contentClassName}>
              {tableLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Loading supplier credit notes…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No supplier credit notes match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 theme-table-body-row">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.credit_note_no}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.supplier?.supplier_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatShortDate(row.credit_date)}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-slate-700" title={row.reason}>
                      {row.reason}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatSaleKes(row.total_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <ReturnStatusBadge status={mapSupplierStatus(row.status)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SupplierCreditNoteRowActions
                        row={row}
                        busyId={busyId}
                        canManage={canManage}
                        onRequestAction={(type, r) => {
                          setDialogError(null);
                          setRejectReason("");
                          setDialog({ type, row: r });
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </section>

      {dialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md theme-panel rounded-xl border p-5 shadow-xl">
            <h2 className="text-[15px] font-medium text-slate-900">
              {dialog.type === "approve"
                ? "Approve supplier credit note?"
                : dialog.type === "reject"
                  ? "Reject supplier credit note?"
                  : "Delete supplier credit note?"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {dialog.row.credit_note_no} — {formatSaleKes(dialog.row.total_amount)}
            </p>
            {dialog.type === "reject" ? (
              <textarea
                rows={3}
                className={`${FILTER_CONTROL_CLASS} mt-4 w-full`}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection"
              />
            ) : null}
            {dialogError ? <p className="mt-3 text-sm text-red-600">{dialogError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busyId}
                onClick={() => {
                  setDialog(null);
                  setDialogError(null);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId}
                onClick={() => void confirmDialogAction()}
                className="flex-1 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white"
              >
                {busyId ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
