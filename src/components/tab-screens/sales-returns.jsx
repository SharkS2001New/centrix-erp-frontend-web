"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { isKraDeviceEnabled } from "@/lib/finance-settings";
import { useQueuedTask } from "@/lib/use-queued-task";
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
import { canManageSalesReturns } from "@/lib/approval-permissions";
import {
  CustomerReturnActionDialog,
  CustomerReturnRowActions,
} from "@/components/sales/customer-return-actions";
import { CustomerReturnDetailModal } from "@/components/sales/customer-return-detail-modal";
import { printCustomerReturn } from "@/components/sales/credit-note-print";
import { ReturnStatusBadge } from "@/components/sales/customer-returns-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import { defaultDateRange } from "@/lib/datetime";
import { useAuth } from "@/contexts/auth-context";
import { notifyError, notifySuccess } from "@/lib/notify";


export function SalesReturnsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { capabilities, hasPermission, organization, generalSettings, user } = useAuth();
  const { runQueuedTask } = useQueuedTask(
    "Please wait while the credit note is submitted to the KRA device…",
  );
  const kraDeviceEnabled = isKraDeviceEnabled(capabilities?.module_settings, capabilities);
  const canManageReturns = canManageSalesReturns({ hasPermission, capabilities });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const defaultRange = useMemo(() => defaultDateRange(30), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogError, setDialogError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const params = { per_page: 200 };
      if (statusFilter !== "all") params.status = statusFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await apiRequest("/customer-returns", { searchParams: params });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load returns");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, fromDate, toDate]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const invoice = row.sale ? formatReceiptNumber(row.sale).toLowerCase() : "";
      const customer = (row.customer?.customer_name ?? "").toLowerCase();
      return (
        String(row.return_no ?? "").toLowerCase().includes(q) ||
        invoice.includes(q) ||
        customer.includes(q)
      );
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openDetail = useCallback(async (row) => {
    setActionError(null);
    try {
      const full = await apiRequest(`/customer-returns/${row.id}`);
      setDetailRow(full);
      setDetailOpen(true);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not load return");
    }
  }, []);

  useEffect(() => {
    const returnId = searchParams.get("return_id");
    if (!returnId || loading) return;
    openDetail({ id: returnId });
  }, [searchParams, loading, openDetail]);

  async function refreshDetail(id) {
    await loadData();
    if (!id) return;
    const full = await apiRequest(`/customer-returns/${id}`);
    setDetailRow(full);
  }

  function openActionDialog(type, row) {
    setDialogError(null);
    setActionError(null);
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
    setActionError(null);

    if (type === "reject" && rejectReason.trim().length < 3) {
      setDialogError("Enter a rejection reason (at least 3 characters).");
      return;
    }

    setBusyId(row.id);
    try {
      if (type === "approve") {
        const approveRequest = () =>
          apiRequest(`/customer-returns/${row.id}/approve`, { method: "POST" });
        if (kraDeviceEnabled) {
          await runQueuedTask(approveRequest, {
            message: "Please wait while the credit note is submitted to the KRA device…",
          });
        } else {
          await approveRequest();
        }
        notifySuccess(
          `${row.return_no} approved. Stock restored, order adjusted, and credit note issued.`,
        );
      } else if (type === "reject") {
        await apiRequest(`/customer-returns/${row.id}/reject`, {
          method: "POST",
          body: { reason: rejectReason.trim() },
        });
        notifySuccess(`${row.return_no} rejected.`);
      } else if (type === "delete") {
        await apiRequest(`/customer-returns/${row.id}`, { method: "DELETE" });
        if (detailOpen && detailRow?.id === row.id) {
          setDetailOpen(false);
          setDetailRow(null);
        }
        notifySuccess(`${row.return_no} deleted.`);
      }

      setDialog(null);
      setRejectReason("");
      if (detailOpen && detailRow?.id === row.id && type !== "delete") {
        await refreshDetail(row.id);
      } else {
        await loadData();
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Action failed";
      if (dialog) {
        setDialogError(message);
      } else {
        setActionError(message);
      }
    } finally {
      setBusyId(null);
    }
  }

  const handlePrint = useCallback(
    async (row) => {
      try {
        let printable = row;
        if (!printable.lines?.length || (printable.status === "approved" && !printable.creditNote && !printable.credit_note)) {
          printable = await apiRequest(`/customer-returns/${row.id}`);
        }
        await printCustomerReturn(printable, {
          organization,
          generalSettings: generalSettings(),
          kraEnabled: kraDeviceEnabled,
          user,
        });
      } catch (e) {
        notifyError(e instanceof Error ? e.message : "Failed to print credit note");
      }
    },
    [generalSettings, kraDeviceEnabled, organization, user],
  );

  const manageHint = canManageReturns
    ? null
    : " Approve, reject, edit, and delete require Sales manage or an assigned sales approver role.";

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Returns</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage product returns and refunds.{manageHint}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <PrimaryLink href="/sales/returns/new">Create return</PrimaryLink>
        </div>
      </div>

      <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <FilterToolbar className="mb-0 border-b border-slate-100 p-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search return no. or invoice…"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "Status: All" },
              { value: "pending", label: "Pending" },
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
        {actionError ? <p className="px-4 py-3 text-sm text-red-600">{actionError}</p> : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="theme-table-head-row text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Return no.</th>
                <th className="px-4 py-3">Invoice no.</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="w-36 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Loading returns…
                  </td>
                </tr>
              ) : pageSlice.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No returns match your filters.
                  </td>
                </tr>
              ) : (
                pageSlice.map((row) => {
                  const customerName =
                    row.customer?.customer_name ??
                    row.sale?.customer_name_override ??
                    "Walk-in";
                  return (
                    <tr key={row.id} className="border-t border-slate-100 theme-table-body-row">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openDetail(row)}
                          className="font-medium text-[#185FA5] hover:underline"
                        >
                          {row.return_no}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {row.sale ? (
                          <Link
                            href={`/sales/orders/${row.sale_id}`}
                            className="text-slate-700 hover:text-[#185FA5] hover:underline"
                          >
                            {formatReceiptNumber(row.sale)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{customerName}</td>
                      <td className="px-4 py-3 text-slate-600">{formatShortDate(row.return_date)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatSaleKes(row.total_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <ReturnStatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <CustomerReturnRowActions
                          row={row}
                          busyId={busyId}
                          canManage={canManageReturns}
                          onRequestAction={openActionDialog}
                          onPrint={handlePrint}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
      </section>

      <CustomerReturnActionDialog
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

      <CustomerReturnDetailModal
        open={detailOpen}
        row={detailRow}
        busy={Boolean(busyId)}
        canManage={canManageReturns}
        onClose={() => {
          setDetailOpen(false);
          setDetailRow(null);
          setActionError(null);
        }}
        onRequestAction={openActionDialog}
        onEdit={(row) => {
          setDetailOpen(false);
          router.push(`/sales/returns/${row.id}/edit`);
        }}
        onPrint={handlePrint}
        error={actionError}
      />
    </div>
  );
}
