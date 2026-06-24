"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/lib/sales";

const PAGE_SIZE = 10;

function legacyReturnStatusLabel(summary) {
  if (!summary?.has_returns) return "No returns";
  if (summary?.fully_returned) return "Fully returned";
  return "Partially returned";
}

function LegacyOrdersContent() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [returnsFilter, setReturnsFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const params = { per_page: 200 };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (returnsFilter === "with_returns") params.has_returns = true;
      if (returnsFilter === "no_returns") params.has_returns = false;

      const res = await apiRequest("/legacy-orders", { searchParams: params });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load legacy orders");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, returnsFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, fromDate, toDate, returnsFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const customer = (row.customer?.customer_name ?? row.customer_name_override ?? "").toLowerCase();
      const legacy = String(row.fulfillment_meta?.legacy_order_label ?? "").toLowerCase();
      return (
        String(row.order_num ?? "").includes(q) ||
        customer.includes(q) ||
        legacy.includes(q) ||
        formatReceiptNumber(row).toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const highlightSaleId = searchParams.get("sale_id");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Legacy orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Materialized LightStores sales for KRA returns. Centrix stock is not affected by legacy
            returns.
          </p>
        </div>
        <PrimaryLink href="/sales/legacy-returns/new">New legacy return</PrimaryLink>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Order, customer, legacy ref…" />
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
        <FilterSelect
          value={returnsFilter}
          onChange={setReturnsFilter}
          options={[
            { value: "all", label: "All orders" },
            { value: "with_returns", label: "With returns" },
            { value: "no_returns", label: "No returns yet" },
          ]}
        />
      </div>

      <div className="theme-panel overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Legacy ref</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Returns</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : pageSlice.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No materialized legacy orders found.
                </td>
              </tr>
            ) : (
              pageSlice.map((row) => {
                const summary = row.legacy_return_summary ?? {};
                const highlighted = highlightSaleId && String(row.id) === highlightSaleId;
                return (
                  <tr
                    key={row.id}
                    className={`border-t ${highlighted ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium">{formatReceiptNumber(row)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.fulfillment_meta?.legacy_order_label ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.customer?.customer_name ?? row.customer_name_override ?? "Walk-in"}
                    </td>
                    <td className="px-3 py-2">
                      {formatShortDate(row.completed_at ?? row.fulfillment_meta?.legacy_sale_date)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatSaleKes(row.order_total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          summary.has_returns
                            ? "text-amber-800"
                            : "text-slate-500"
                        }
                      >
                        {legacyReturnStatusLabel(summary)}
                      </span>
                      {summary.return_count > 0 ? (
                        <div className="text-xs text-slate-500">
                          {summary.return_count} return(s) · {formatSaleKes(summary.returned_total)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/sales/legacy-returns/new?sale_id=${row.id}`}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        Return
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar page={safePage} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

export default function LegacyOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading legacy orders…</p>}>
      <LegacyOrdersContent />
    </Suspense>
  );
}
