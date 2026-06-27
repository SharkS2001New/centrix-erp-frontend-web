"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { printCreditNote } from "@/components/sales/credit-note-print";
import { ReturnStatusBadge } from "@/components/sales/customer-returns-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";

const PAGE_SIZE = 10;

function LegacyReturnsContent() {
  const searchParams = useSearchParams();
  const { organization, generalSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [detailRow, setDetailRow] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const params = { per_page: 200 };
      if (statusFilter !== "all") params.status = statusFilter;
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await apiRequest("/legacy-returns", { searchParams: params });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load legacy returns");
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
      const full = await apiRequest(`/legacy-returns/${row.id}`);
      setDetailRow(full);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not load return");
    }
  }, []);

  useEffect(() => {
    const returnId = searchParams.get("return_id");
    if (!returnId || loading) return;
    openDetail({ id: returnId });
  }, [searchParams, loading, openDetail]);

  function handlePrint(row) {
    const payload = row.credit_note ? row : detailRow;
    if (!payload?.credit_note && !payload?.creditNote) {
      setActionError("Credit note is not available for printing yet.");
      return;
    }
    printCreditNote(payload, {
      organization,
      generalSettings: generalSettings(),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Legacy returns</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            KRA credit notes against materialized legacy orders. Stock is not restocked in Centrix.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sales/legacy-orders" className="text-sm text-slate-600 hover:text-slate-900">
            Legacy orders
          </Link>
          <PrimaryLink href="/sales/legacy-returns/new">New legacy return</PrimaryLink>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Return no, invoice, customer…" />
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "approved", label: "Approved" },
            { value: "pending", label: "Pending" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
        <input
          type="date"
          className="rounded-md border px-3 py-2 text-sm"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <input
          type="date"
          className="rounded-md border px-3 py-2 text-sm"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      <div className="theme-panel overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Return</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Credit</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">KRA</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : pageSlice.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No legacy returns yet.
                </td>
              </tr>
            ) : (
              pageSlice.map((row) => {
                const creditNote = row.credit_note ?? row.creditNote;
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.return_no}</td>
                    <td className="px-3 py-2">
                      {row.sale ? formatReceiptNumber(row.sale) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.customer?.customer_name ?? row.sale?.customer_name_override ?? "—"}
                    </td>
                    <td className="px-3 py-2">{formatShortDate(row.return_date)}</td>
                    <td className="px-3 py-2 text-right">{formatSaleKes(row.total_amount)}</td>
                    <td className="px-3 py-2">
                      <ReturnStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {creditNote?.kra_status === "success"
                        ? "Fiscalized"
                        : creditNote?.kra_status === "failed"
                          ? "Failed"
                          : creditNote?.kra_status ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="mr-3 text-indigo-600 hover:text-indigo-800"
                        onClick={() => openDetail(row)}
                      >
                        View
                      </button>
                      {row.status === "approved" && creditNote ? (
                        <button
                          type="button"
                          className="text-indigo-600 hover:text-indigo-800"
                          onClick={() => handlePrint(row)}
                        >
                          Print CN
                        </button>
                      ) : null}
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

      {detailRow ? (
        <div className="theme-panel rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{detailRow.return_no}</h2>
              <p className="text-slate-600">
                {detailRow.sale ? formatReceiptNumber(detailRow.sale) : "—"} ·{" "}
                {formatSaleKes(detailRow.total_amount)}
              </p>
            </div>
            <div className="flex gap-2">
              {detailRow.status === "approved" && (detailRow.credit_note ?? detailRow.creditNote) ? (
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => handlePrint(detailRow)}
                >
                  Print credit note
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => setDetailRow(null)}
              >
                Close
              </button>
            </div>
          </div>
          <ul className="mt-4 space-y-1">
            {(detailRow.lines ?? []).map((line) => (
              <li key={line.id ?? line.product_code}>
                {line.product_name ?? line.product_code} — qty {line.return_qty} —{" "}
                {formatSaleKes(line.amount)}
              </li>
            ))}
          </ul>
          {(detailRow.credit_note ?? detailRow.creditNote)?.kra_status === "failed" &&
          (detailRow.credit_note ?? detailRow.creditNote)?.kra_error_message ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              KRA device error:{" "}
              {(detailRow.credit_note ?? detailRow.creditNote).kra_error_message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function LegacyReturnsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading legacy returns…</p>}>
      <LegacyReturnsContent />
    </Suspense>
  );
}
