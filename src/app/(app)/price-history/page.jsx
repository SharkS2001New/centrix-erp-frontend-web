"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { PRICE_HISTORY_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";

function formatKes(value) {
  if (value == null || value === "") return "—";
  return `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDiscount(pct) {
  const n = Number(pct ?? 0);
  return n === 0 ? "0%" : `${n}%`;
}

function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function priceDelta(oldPrice, newPrice) {
  if (oldPrice == null) return { type: "none", label: "—" };
  const oldN = Number(oldPrice);
  const newN = Number(newPrice);
  if (oldN === newN) return { type: "nc", label: "no change" };
  const pct = oldN === 0 ? 0 : ((newN - oldN) / oldN) * 100;
  const abs = Math.abs(pct);
  const label = `${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)}%`;
  if (newN > oldN) return { type: "up", label };
  return { type: "dn", label };
}

function enrichHistory(records) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
  );
  const prevPrice = new Map();

  const enriched = sorted.map((row) => {
    const unitPrice = Number(row.unit_price);
    const oldPrice = prevPrice.has(row.product_code)
      ? prevPrice.get(row.product_code)
      : row.previous_unit_price != null
        ? Number(row.previous_unit_price)
        : null;
    prevPrice.set(row.product_code, unitPrice);

    const product = row.product;
    const sub = product?.subcategory;
    const user = row.changed_by_user ?? row.changedByUser;
    const userName = user?.username ?? user?.full_name ?? "—";

    return {
      ...row,
      product_name: product?.product_name ?? "—",
      category_id: sub?.category_id ?? null,
      old_price: oldPrice,
      new_price: unitPrice,
      cost_price: row.cost_price,
      discount_pct: row.discount_pct,
      changed_by_name: userName,
      delta: priceDelta(oldPrice, unitPrice),
      is_unit_price_change: oldPrice == null || oldPrice !== unitPrice,
    };
  });

  return enriched
    .filter((row) => row.is_unit_price_change)
    .sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    );
}

function groupByProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    let group = map.get(row.product_code);
    if (!group) {
      group = {
        product_code: row.product_code,
        product_name: row.product_name,
        category_id: row.category_id,
        changes: [],
        latest_at: row.changed_at,
        current_price: row.new_price,
      };
      map.set(row.product_code, group);
    }
    group.changes.push(row);
    if (new Date(row.changed_at) >= new Date(group.latest_at)) {
      group.latest_at = row.changed_at;
      group.current_price = row.new_price;
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime(),
  );
}

const RECORDS_PAGE_SIZE = 50;

export default function PriceHistoryPage() {
  const [records, setRecords] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(() => new Set());

  const loadReferenceData = useCallback(async () => {
    try {
      const [catRes, userRes] = await Promise.all([
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
      ]);
      setCategories(catRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setListLoading(true);
    try {
      const extra = { days: 7 };
      if (categoryFilter !== "all") extra.category_id = categoryFilter;
      if (userFilter !== "all") extra.changed_by = userFilter;

      const searchParams = buildPageParams({
        page,
        perPage: RECORDS_PAGE_SIZE,
        q: debouncedSearch,
        extra,
      });
      const histRes = await apiRequest("/price-history", { searchParams });
      const parsed = parsePaginator(histRes);
      setRecords(parsed.items);
      setTotalRecords(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load price history");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, debouncedSearch, categoryFilter, userFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, userFilter]);

  const enriched = useMemo(() => enrichHistory(records), [records]);

  const productGroups = useMemo(() => groupByProduct(enriched), [enriched]);

  useEffect(() => {
    setExpanded(new Set(productGroups.map((g) => g.product_code)));
  }, [page, productGroups]);

  function toggleProduct(code) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-900">Price history</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Selling price changes in the last 7 days, grouped by product
          </p>
        </div>
        <CatalogListExport
          title="Price history"
          filename="price-history"
          apiPath="/price-history"
          columns={PRICE_HISTORY_EXPORT_COLUMNS}
          totalCount={totalRecords}
          getSearchParams={() => {
            const extra = { days: 7 };
            if (categoryFilter !== "all") extra.category_id = categoryFilter;
            if (userFilter !== "all") extra.changed_by = userFilter;
            return buildPageParams({ page: 1, perPage: 200, q: debouncedSearch, extra });
          }}
          disabled={loading || listLoading}
        />
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by product name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none placeholder:text-slate-500 focus:border-[#185FA5] focus:ring-2 focus:ring-[#185FA5]/20"
          />
        </div>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          Last 7 days
        </span>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[#185FA5]"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.category_name}
            </option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[#185FA5]"
        >
          <option value="all">All users</option>
          {users.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.username ?? u.full_name}
            </option>
          ))}
        </select>
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading price history…</p>
        ) : productGroups.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            No price changes in the last 7 days match your filters.
          </p>
        ) : (
          <ul className={`divide-y divide-slate-200 ${listLoading ? "opacity-60" : ""}`}>
            {productGroups.map((group) => {
              const isOpen = expanded.has(group.product_code);
              return (
                <li key={group.product_code}>
                  <button
                    type="button"
                    onClick={() => toggleProduct(group.product_code)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
                  >
                    <ChevronIcon open={isOpen} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-slate-900">{group.product_name}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                          {group.product_code}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {group.changes.length} price change{group.changes.length === 1 ? "" : "s"} ·
                        current {formatKes(group.current_price)} · last updated{" "}
                        {formatDateTime(group.latest_at)}
                      </p>
                    </div>
                    <Link
                      href={`/products/${encodeURIComponent(group.product_code)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-xs font-medium text-[#185FA5] hover:underline"
                    >
                      View product
                    </Link>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-3">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            <th className="py-2 pr-3">Changed at</th>
                            <th className="py-2 pr-3">Old price</th>
                            <th className="py-2 pr-3">New price</th>
                            <th className="py-2 pr-3">Cost</th>
                            <th className="py-2 pr-3">Discount</th>
                            <th className="py-2">Changed by</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.changes.map((row) => (
                            <tr
                              key={row.id}
                              className="border-t border-slate-100 first:border-t-0"
                            >
                              <td className="py-2.5 pr-3 text-slate-600">
                                {formatDateTime(row.changed_at)}
                              </td>
                              <td className="py-2.5 pr-3">
                                {row.old_price != null ? (
                                  <span className="text-xs text-slate-400 line-through">
                                    {formatKes(row.old_price)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400">Initial</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-3">
                                <span className="font-mono">{formatKes(row.new_price)}</span>{" "}
                                <PriceDelta delta={row.delta} />
                              </td>
                              <td className="py-2.5 pr-3 font-mono text-slate-700">
                                {formatKes(row.cost_price)}
                              </td>
                              <td className="py-2.5 pr-3">{formatDiscount(row.discount_pct)}</td>
                              <td className="py-2.5">
                                <span className="inline-flex items-center text-slate-700">
                                  <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E6F1FB] text-[10px] font-medium text-[#0C447C]">
                                    {initials(row.changed_by_name)}
                                  </span>
                                  {row.changed_by_name}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && totalRecords > 0 ? (
          <div className="border-t border-slate-200 px-4 py-2.5">
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={totalRecords}
              pageSize={RECORDS_PAGE_SIZE}
              onChange={setPage}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PriceDelta({ delta }) {
  if (delta.type === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[#27500A]">
        <ArrowUpIcon />
        {delta.label}
      </span>
    );
  }
  if (delta.type === "dn") {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[#A32D2D]">
        <ArrowDownIcon />
        {delta.label}
      </span>
    );
  }
  if (delta.type === "nc") {
    return <span className="text-xs text-slate-400">{delta.label}</span>;
  }
  return null;
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SearchIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
