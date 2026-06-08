"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import {
  PaymentStatusBadge,
  SaleStatusBadge,
  formatReceiptNumber,
  formatSaleKes,
} from "@/components/sales/sales-shared";
import { filterSalesByPeriod, saleCustomerLabel } from "@/lib/sales";

const PAGE_SIZE = 15;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "booked", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "paid", label: "Paid" },
  { value: "processed", label: "Packed" },
  { value: "completed", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function SalesOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const params = { per_page: 200 };
      if (statusFilter !== "all") params["filter[status]"] = statusFilter;
      const res = await apiRequest("/sales", { searchParams: params });
      setRows(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const receipt = formatReceiptNumber(s).toLowerCase();
        const customer = saleCustomerLabel(s).toLowerCase();
        const orderNum = String(s.order_num ?? "");
        return receipt.includes(q) || customer.includes(q) || orderNum.includes(q);
      });
    }
    if (dateFilter !== "all") {
      list = filterSalesByPeriod(list, dateFilter === "today" ? "day" : dateFilter);
    }
    return list.sort((a, b) => {
      const da = new Date(a.completed_at ?? a.created_at ?? 0).getTime();
      const db = new Date(b.completed_at ?? b.created_at ?? 0).getTime();
      return db - da;
    });
  }, [rows, search, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFilter]);

  return (
    <CatalogPageShell
      title="Sales orders"
      subtitle="Completed and in-progress orders"
      action={<PrimaryLink href="/sales/pos">+ New sale</PrimaryLink>}
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt, customer, order #…"
            className="max-w-md"
          />
          <FilterSelect value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} options={DATE_OPTIONS} />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null
      }
    >
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading orders…</p>
        ) : pageSlice.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No orders match your filters.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-2.5">Receipt</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Payment</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((sale) => (
                <tr key={sale.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/sales/orders/${sale.id}`} className="text-[#185FA5] hover:underline">
                      {formatReceiptNumber(sale)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{saleCustomerLabel(sale)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatSaleKes(sale.order_total)}
                  </td>
                  <td className="px-4 py-3">
                    <SaleStatusBadge status={sale.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={sale.payment_status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatShortDate(sale.completed_at ?? sale.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/sales/orders/${sale.id}`}
                      className="inline-flex rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      title="View order"
                    >
                      <EyeIcon />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>
    </CatalogPageShell>
  );
}
