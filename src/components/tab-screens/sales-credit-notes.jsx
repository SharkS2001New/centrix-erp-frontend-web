"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
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
import { CreditNotesTabs } from "@/components/sales/credit-notes-tabs";
import { CustomerReturnActionDialog } from "@/components/sales/customer-return-actions";
import { CustomerReturnDetailModal } from "@/components/sales/customer-return-detail-modal";
import { printCustomerReturn } from "@/components/sales/credit-note-print";
import { ReturnStatusBadge } from "@/components/sales/customer-returns-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import { defaultDateRange } from "@/lib/datetime";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { CreditNoteRowActions } from "@/components/sales/credit-note-actions";

function resolveCreditNoteRow(row) {
  const customerReturn = row.customer_return ?? row.customerReturn ?? null;
  return {
    ...row,
    status: row.status ?? customerReturn?.status,
    return_no: customerReturn?.return_no,
    return_date: row.credit_date ?? customerReturn?.return_date,
    total_amount: row.total_amount ?? customerReturn?.total_amount,
    customer: customerReturn?.customer,
    sale: row.sale ?? customerReturn?.sale,
    sale_id: row.sale_id ?? customerReturn?.sale_id,
    can_approve: row.can_approve ?? customerReturn?.can_approve,
    can_reject: row.can_reject ?? customerReturn?.can_reject,
    can_delete: row.can_delete ?? customerReturn?.can_delete,
    can_print: row.can_print ?? true,
    customerReturn,
  };
}

function printableFromCreditNoteRow(row) {
  const customerReturn = row.customerReturn ?? row.customer_return;
  if (!customerReturn) return row;
  return {
    ...customerReturn,
    credit_note: row,
    creditNote: row,
  };
}

export function SalesCreditNotesScreen() {
  const searchParams = useSearchParams();
  const { capabilities, hasPermission, organization, generalSettings, user } = useAuth();
  const { runQueuedTask } = useQueuedTask(
    "Please wait while the credit note is submitted to the KRA device…",
  );
  const kraDeviceEnabled = isKraDeviceEnabled(capabilities?.module_settings, capabilities);
  const canManage = canManageSalesReturns({ hasPermission, capabilities });
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [dialogError, setDialogError] = useState(null);
  const [actionError, setActionError] = useState(null);

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
      const res = await apiRequest("/credit-notes", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setRows(parsed.items.map(resolveCreditNoteRow));
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load credit notes");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, fromDate, toDate]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, fromDate, toDate]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const safePage = Math.min(page, totalPages);
  const tableLoading = loading || (listLoading && rows.length === 0);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const openDetail = useCallback(async (row) => {
    setActionError(null);
    try {
      const full = await apiRequest(`/credit-notes/${row.id}`);
      const customerReturn = full.customer_return ?? full.customerReturn;
      setDetailRow(
        customerReturn
          ? {
              ...customerReturn,
              credit_note: full,
              creditNote: full,
            }
          : full,
      );
      setDetailOpen(true);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not load credit note");
    }
  }, []);

  useEffect(() => {
    const creditNoteId = searchParams.get("credit_note_id");
    if (!creditNoteId || loading) return;
    openDetail({ id: creditNoteId });
  }, [searchParams, loading, openDetail]);

  async function refreshDetail(id) {
    await loadData();
    if (!id) return;
    const full = await apiRequest(`/credit-notes/${id}`);
    const customerReturn = full.customer_return ?? full.customerReturn;
    setDetailRow(
      customerReturn
        ? {
            ...customerReturn,
            credit_note: full,
            creditNote: full,
          }
        : full,
    );
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
          apiRequest(`/credit-notes/${row.id}/approve`, { method: "POST" });
        if (kraDeviceEnabled) {
          await runQueuedTask(approveRequest, {
            message: "Please wait while the credit note is submitted to the KRA device…",
          });
        } else {
          await approveRequest();
        }
        notifySuccess(
          `${row.credit_note_no} approved. The order was adjusted and the credit note issued.`,
        );
      } else if (type === "reject") {
        await apiRequest(`/credit-notes/${row.id}/reject`, {
          method: "POST",
          body: { reason: rejectReason.trim() },
        });
        notifySuccess(`${row.credit_note_no} rejected.`);
      } else if (type === "delete") {
        await apiRequest(`/credit-notes/${row.id}`, { method: "DELETE" });
        if (detailOpen && detailRow?.credit_note?.id === row.id) {
          setDetailOpen(false);
          setDetailRow(null);
        }
        notifySuccess(`${row.credit_note_no} deleted.`);
      }

      setDialog(null);
      setRejectReason("");
      if (detailOpen && detailRow?.credit_note?.id === row.id && type !== "delete") {
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
        let printable = printableFromCreditNoteRow(row);
        if (!printable.lines?.length) {
          const full = await apiRequest(`/credit-notes/${row.id}`);
          printable = printableFromCreditNoteRow(resolveCreditNoteRow(full));
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

  const manageHint = canManage
    ? null
    : " Approve, reject, and delete require Sales manage or an assigned sales approver role.";

  const dialogRow = dialog?.row
    ? {
        ...dialog.row,
        return_no: dialog.row.credit_note_no ?? dialog.row.return_no,
        status: dialog.row.status,
      }
    : null;

  return (
    <div className="theme-workspace min-h-full">
      <CreditNotesTabs active="customer" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Credit notes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue credits for billing errors or price adjustments without returning stock.{manageHint}
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
          <PrimaryLink href="/sales/credit-notes/new">Create credit note</PrimaryLink>
        </div>
      </div>

      <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <FilterToolbar className="mb-0 border-b border-slate-100 p-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search credit note no. or invoice…"
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
                <th className="px-4 py-3">Credit note no.</th>
                <th className="px-4 py-3">Invoice no.</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="w-36 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Loading credit notes…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No credit notes match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
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
                          {row.credit_note_no}
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
                        <CreditNoteRowActions
                          row={row}
                          busyId={busyId}
                          canManage={canManage}
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
          total={total}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </section>

      <CustomerReturnActionDialog
        open={Boolean(dialog)}
        type={dialog?.type}
        row={dialogRow}
        rejectReason={rejectReason}
        onRejectReasonChange={setRejectReason}
        saving={Boolean(busyId)}
        error={dialogError}
        onClose={closeActionDialog}
        onConfirm={confirmDialogAction}
        variant="credit_note"
      />

      <CustomerReturnDetailModal
        open={detailOpen}
        row={detailRow}
        busy={Boolean(busyId)}
        canManage={canManage}
        onClose={() => {
          setDetailOpen(false);
          setDetailRow(null);
          setActionError(null);
        }}
        onRequestAction={(type, row) => {
          const creditNote = row.credit_note ?? row.creditNote;
          openActionDialog(type, creditNote ? { ...creditNote, status: row.status } : row);
        }}
        onPrint={handlePrint}
        error={actionError}
      />
    </div>
  );
}
