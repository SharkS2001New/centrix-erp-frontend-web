"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { CustomerReturnDetailModal } from "@/components/sales/customer-return-detail-modal";
import { printCreditNote } from "@/components/sales/credit-note-print";
import { ReturnStatusBadge, isReturnPending } from "@/components/sales/customer-returns-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";
import { useAuth } from "@/contexts/auth-context";

const PAGE_SIZE = 10;

export default function SalesReturnsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { capabilities } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

  async function handleApprove(row) {
    if (!window.confirm(`Approve ${row.return_no}? Stock will be restocked.`)) return;
    setActionBusy(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await apiRequest(`/customer-returns/${row.id}/approve`, { method: "POST" });
      setSuccessMessage(
        `${row.return_no} approved. Stock restored, order adjusted, and credit note issued.`,
      );
      await refreshDetail(row.id);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Approve failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReject(row) {
    const reason = window.prompt("Reject reason (optional):");
    if (reason === null) return;
    setActionBusy(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await apiRequest(`/customer-returns/${row.id}/reject`, {
        method: "POST",
        body: { reason: reason.trim() || null },
      });
      setSuccessMessage(`${row.return_no} rejected.`);
      await refreshDetail(row.id);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Reject failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete(row) {
    const msg =
      row.status === "approved"
        ? `Delete ${row.return_no}? Restocked quantities will be reversed.`
        : `Delete ${row.return_no}?`;
    if (!window.confirm(msg)) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await apiRequest(`/customer-returns/${row.id}`, { method: "DELETE" });
      setDetailOpen(false);
      setDetailRow(null);
      await loadData();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Returns</h1>
          <p className="mt-1 text-sm text-slate-500">Manage product returns and refunds</p>
        </div>
        <PrimaryLink href="/sales/returns/new">Create return</PrimaryLink>
      </div>

      <section className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search return no. or invoice…"
            className="flex-1"
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
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            aria-label="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
            aria-label="To date"
          />
        </div>

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
                <th className="px-4 py-3 text-right">Actions</th>
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
                        <div className="flex items-center justify-end gap-2">
                          {isReturnPending(row.status) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApprove(row)}
                                disabled={actionBusy}
                                className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReject(row)}
                                disabled={actionBusy}
                                className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openDetail(row)}
                            className="text-sm font-medium text-[#185FA5] hover:underline"
                          >
                            View
                          </button>
                        </div>
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
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </section>

      <CustomerReturnDetailModal
        open={detailOpen}
        row={detailRow}
        busy={actionBusy}
        onClose={() => {
          setDetailOpen(false);
          setDetailRow(null);
          setSuccessMessage(null);
          setActionError(null);
        }}
        onApprove={handleApprove}
        onReject={handleReject}
        onEdit={(row) => {
          setDetailOpen(false);
          router.push(`/sales/returns/${row.id}/edit`);
        }}
        onDelete={handleDelete}
        onPrint={(row) => {
          printCreditNote(row, {
            organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
          });
        }}
        error={actionError}
        successMessage={successMessage}
      />
    </div>
  );
}
