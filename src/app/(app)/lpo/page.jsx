"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  SearchInput,
  StatCard,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { formatLpoKes, formatPoNumber, LpoStatusBadge } from "@/components/lpo/lpo-shared";

const PAGE_SIZE = 15;

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function LpoListPage() {
  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const params = { per_page: 200 };
      if (search.trim()) params.q = search.trim();
      if (supplierFilter !== "all") params.supplier_id = supplierFilter;
      if (statusFilter !== "all") params.status_code = statusFilter;

      const [dashRes, listRes, supRes, statusRes] = await Promise.all([
        apiRequest("/lpo-mst/dashboard"),
        apiRequest("/lpo-mst", { searchParams: params }),
        apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
        apiRequest("/lpo-statuses", { searchParams: { per_page: 50 } }).catch(() => ({
          data: [],
        })),
      ]);
      setDashboard(dashRes);
      setRows(listRes.data ?? []);
      setSuppliers(supRes.data ?? []);
      setStatuses(statusRes.data ?? statusRes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [search, supplierFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, supplierFilter, statusFilter]);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      ...statuses.map((s) => ({
        value: String(s.status_code),
        label: s.status_name,
      })),
    ],
    [statuses],
  );

  return (
    <CatalogPageShell
      title="Purchase orders (LPO)"
      subtitle="Procure from suppliers — links to supplier accounts payable and stock receipt"
      action={
        <Link
          href="/lpo/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          <PlusIcon />
          New purchase order
        </Link>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO #, supplier, reference…"
            className="max-w-md"
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={statusOptions}
          />
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {dashboard && !loading && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="POs this month" value={String(dashboard.total_pos ?? 0)} />
          <StatCard label="Total value" value={formatLpoKes(dashboard.total_value)} />
          <StatCard label="Pending" value={String(dashboard.pending_count ?? 0)} />
          <StatCard
            label="Cleared / partial"
            value={`${dashboard.cleared_count ?? 0} / ${dashboard.partially_received_count ?? 0}`}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading purchase orders…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">PO #</th>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Balance</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        No purchase orders found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr
                        key={row.lpo_no}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-mono font-medium text-[#185FA5]">
                          <Link href={`/lpo/${row.lpo_no}`} className="hover:underline">
                            {row.po_number ?? formatPoNumber(row.lpo_no)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/suppliers/${row.supplier_id}`}
                            className="font-medium text-slate-800 hover:text-[#185FA5]"
                          >
                            {row.supplier_name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <div className="font-medium text-slate-800">
                            {row.created_by_name ?? "—"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.order_date ? formatShortDate(row.order_date) : "—"}
                          </div>
                          {Number(row.amount_paid) > 0 ? (
                            <div className="mt-1 space-y-0.5 text-xs">
                              <div className="text-emerald-700">
                                Paid {formatLpoKes(row.amount_paid)}
                              </div>
                              <div className="text-amber-700">
                                Bal {formatLpoKes(row.balance_due)}
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatLpoKes(row.net_amount ?? row.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-700">
                          {formatLpoKes(row.balance_due)}
                        </td>
                        <td className="px-4 py-3">
                          <LpoStatusBadge
                            statusName={row.status_name}
                            clearedFlag={row.cleared_flag}
                            statusCode={row.lpo_status_code}
                            paymentStatus={row.payment_status}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/lpo/${row.lpo_no}`}
                            className="text-xs font-medium text-[#185FA5] hover:underline"
                          >
                            View
                          </Link>
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
              total={rows.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </CatalogPageShell>
  );
}
