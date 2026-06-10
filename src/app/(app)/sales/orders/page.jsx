"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getChannelWorkflow, getOrderWorkflow, matchesWorkflowStatusFilter, workflowStatusFilterOptions } from "@/lib/order-workflow";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PaginationBar,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { isoDate, rowInDateRange } from "@/components/inventory/inventory-shared";
import {
  ORDER_SOURCE_FILTER_OPTIONS,
  OrderListTableRow,
  indexSalesWithItems,
  matchesOrderSourceFilter,
} from "@/components/sales/sales-orders-shared";
import { saleCustomerLabel } from "@/lib/sales";

const PAGE_SIZE = 15;

export default function SalesOrdersPage() {
  const { capabilities, refreshCapabilities } = useAuth();
  const orgWorkflow = useMemo(
    () => getChannelWorkflow(capabilities, "backend"),
    [capabilities],
  );
  const statusOptions = useMemo(
    () => workflowStatusFilterOptions(orgWorkflow),
    [orgWorkflow],
  );

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => isoDate());
  const [toDate, setToDate] = useState(() => isoDate());
  const [page, setPage] = useState(1);
  const [detailsById, setDetailsById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [transitionBusyId, setTransitionBusyId] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [uomById, setUomById] = useState(() => new Map());

  useEffect(() => {
    refreshCapabilities().catch(() => {});
  }, [refreshCapabilities]);

  useEffect(() => {
    apiRequest("/uoms", { searchParams: { per_page: 500 } })
      .then((res) => {
        const map = new Map();
        for (const u of res.data ?? []) {
          if (u?.id != null) map.set(u.id, u);
        }
        setUomById(map);
      })
      .catch(() => setUomById(new Map()));
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { per_page: 200, exclude_status: "held", with_items: 1 };
      if (statusFilter !== "all") params["filter[status]"] = statusFilter;
      const res = await apiRequest("/sales", { searchParams: params });
      const list = res.data ?? [];
      setRows(list);
      setDetailsById(indexSalesWithItems(list));

      const missing = list.filter((sale) => !sale?.items?.length);
      if (missing.length) {
        const loaded = await Promise.all(
          missing.map((sale) => apiRequest(`/sales/${sale.id}`).catch(() => null)),
        );
        setDetailsById((prev) => {
          const next = { ...prev };
          for (const sale of loaded) {
            if (sale?.id) next[String(sale.id)] = sale;
          }
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function loadOrderDetail(orderId) {
    const key = String(orderId);
    if (detailsById[key]?.items?.length) return detailsById[key];
    setDetailLoadingId(key);
    try {
      const sale = await apiRequest(`/sales/${orderId}`);
      setDetailsById((prev) => ({ ...prev, [key]: sale }));
      return sale;
    } catch {
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }

  function toggleExpand(saleId) {
    const key = String(saleId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        void loadOrderDetail(saleId);
      }
      return next;
    });
  }

  async function expandAllOnPage() {
    const ids = pageSlice.map((sale) => String(sale.id));
    setExpandedIds(new Set(ids));
    await Promise.all(pageSlice.map((sale) => loadOrderDetail(sale.id)));
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  function patchSaleInState(updated) {
    if (!updated?.id) return;
    const key = String(updated.id);
    setRows((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setDetailsById((prev) => ({
      ...prev,
      [key]: prev[key] ? { ...prev[key], ...updated } : updated,
    }));
  }

  async function transitionOrder(sale, targetStatus) {
    if (!sale?.id) return;
    setTransitionBusyId(sale.id);
    setActionMessage(null);
    try {
      const updated = await apiRequest(`/sales/orders/${sale.id}/transition`, {
        method: "POST",
        body: { status: targetStatus },
      });
      patchSaleInState(updated);
      setActionMessage(`Order ${sale.order_num ?? sale.id} updated.`);
    } catch (e) {
      setActionMessage(e instanceof ApiError ? e.message : "Could not update order.");
    } finally {
      setTransitionBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    let list = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const receipt = `S${String(s.order_num ?? s.id).padStart(4, "0")}`.toLowerCase();
        const customer = saleCustomerLabel(s).toLowerCase();
        const orderNum = String(s.order_num ?? "");
        return receipt.includes(q) || customer.includes(q) || orderNum.includes(q);
      });
    }
    const rangeFrom = fromDate && toDate && fromDate > toDate ? toDate : fromDate;
    const rangeTo = fromDate && toDate && fromDate > toDate ? fromDate : toDate;
    list = list.filter((s) =>
      rowInDateRange(s, rangeFrom, rangeTo, ["completed_at", "created_at"]),
    );
    list = list.filter((s) => matchesWorkflowStatusFilter(s, statusFilter, orgWorkflow));
    list = list.filter((s) => matchesOrderSourceFilter(s, sourceFilter));
    return list.sort((a, b) => {
      const da = new Date(a.completed_at ?? a.created_at ?? 0).getTime();
      const db = new Date(b.completed_at ?? b.created_at ?? 0).getTime();
      return db - da;
    });
  }, [rows, search, fromDate, toDate, sourceFilter, statusFilter, orgWorkflow]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const workflowBySaleId = useMemo(() => {
    const map = new Map();
    for (const sale of pageSlice) {
      map.set(sale.id, getOrderWorkflow(capabilities, sale));
    }
    return map;
  }, [pageSlice, capabilities]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter, fromDate, toDate]);

  useEffect(() => {
    if (statusFilter === "all") return;
    const allowed = new Set(statusOptions.map((o) => o.value));
    if (!allowed.has(statusFilter)) setStatusFilter("all");
  }, [statusFilter, statusOptions]);

  return (
    <CatalogPageShell
      title="Sales orders"
      subtitle="Manage orders through your configured workflow — save, pay, fulfil, and complete"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/sales/pos"
            className="inline-flex items-center rounded-lg bg-[#185FA5] px-3 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
          >
            + New sale
          </Link>
          <Link
            href="/sales/pos"
            className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Held orders
          </Link>
        </div>
      }
      toolbar={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt, customer, order #…"
              className="max-w-md"
            />
            <Field label="From">
              <input
                type="date"
                className={inputClassName()}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value || isoDate())}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={inputClassName()}
                value={toDate}
                onChange={(e) => setToDate(e.target.value || isoDate())}
              />
            </Field>
            <FilterSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
            />
            <FilterSelect
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              options={ORDER_SOURCE_FILTER_OPTIONS}
            />
          </div>
        </div>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : actionMessage ? (
          <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {actionMessage}
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
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2">
              <p className="text-xs text-slate-500">
                {pageSlice.length} order{pageSlice.length === 1 ? "" : "s"} on this page
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!pageSlice.length}
                  onClick={() => void expandAllOnPage()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  disabled={!expandedIds.size}
                  onClick={collapseAll}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Collapse all
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="w-12 px-4 py-2.5" aria-label="Expand" />
                  <th className="px-4 py-2.5">Receipt</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Workflow</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((sale) => {
                  const key = String(sale.id);

                  return (
                    <OrderListTableRow
                      key={sale.id}
                      sale={sale}
                      workflow={workflowBySaleId.get(sale.id)}
                      detail={detailsById[key]}
                      itemsLoading={detailLoadingId === key}
                      uomById={uomById}
                      expanded={expandedIds.has(key)}
                      onToggleExpand={() => toggleExpand(sale.id)}
                      actionBusy={transitionBusyId === sale.id}
                      onAdvance={(status) => void transitionOrder(sale, status)}
                      onCancel={() => void transitionOrder(sale, "cancelled")}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
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
