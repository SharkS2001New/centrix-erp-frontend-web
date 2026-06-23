"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useAuth } from "@/contexts/auth-context";
import {
  FilterSelect,
  PaginationBar,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import {
  baseToDisplayQty,
  formatInventoryKes,
  formatQty,
  InventoryPageShell,
  InventoryTableShell,
  LOCATION_OPTIONS,
  StockHealthBadge,
} from "@/components/inventory/inventory-shared";
import {
  priceListRowsForProduct,
  priceListToCsv,
  stockSellingValue,
} from "@/lib/retail-pricing";
import { formatMixedStockDisplay } from "@/lib/stock-uom";

const PAGE_SIZE = 15;
const COLUMN_STORAGE_KEY = "centrix-erp-inventory-stock-columns";

const STOCK_COLUMNS = [
  { id: "product", label: "Product", defaultVisible: true, required: true },
  { id: "sku", label: "SKU", defaultVisible: false },
  { id: "shop", label: "Shop", defaultVisible: true, align: "right" },
  { id: "store", label: "Store", defaultVisible: true, align: "right" },
  { id: "shop_value", label: "Shop value", defaultVisible: true, align: "right" },
  { id: "store_value", label: "Store value", defaultVisible: true, align: "right" },
  { id: "profit_margin", label: "Profit margin", defaultVisible: false, align: "right" },
  { id: "reorder", label: "Reorder", defaultVisible: false, align: "right" },
  { id: "status", label: "Status", defaultVisible: true },
];

function defaultVisibleColumnIds() {
  return STOCK_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

function readStoredColumnIds() {
  if (typeof window === "undefined") return defaultVisibleColumnIds();
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleColumnIds();
    const valid = new Set(STOCK_COLUMNS.map((c) => c.id));
    const ids = JSON.parse(raw).filter((id) => valid.has(id));
    for (const col of STOCK_COLUMNS) {
      if (col.required && !ids.includes(col.id)) ids.push(col.id);
    }
    return ids.length ? ids : defaultVisibleColumnIds();
  } catch {
    return defaultVisibleColumnIds();
  }
}

export default function CurrentStockPage() {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [stockRows, setStockRows] = useState([]);
  const [valuationRows, setValuationRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [retailPackages, setRetailPackages] = useState([]);
  const [totalStockRows, setTotalStockRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visibleColumnIds, setVisibleColumnIds] = useState(defaultVisibleColumnIds);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setVisibleColumnIds(readStoredColumnIds());
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      const [catRes, retailRes] = await Promise.all([
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }),
      ]);
      setCategories(catRes.data ?? []);
      setRetailPackages(retailRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock filters");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStock = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: PAGE_SIZE,
        q: debouncedSearch,
        extra: {
          branch_id: branchId,
          category_id: categoryFilter !== "all" ? categoryFilter : undefined,
          location: locationFilter !== "all" ? locationFilter : undefined,
        },
      });
      const [stockRes, valRes] = await Promise.all([
        apiRequest("/reports/stock-on-hand", { searchParams }),
        apiRequest("/reports/stock-valuation", { searchParams }),
      ]);
      const parsed = parsePaginator(stockRes);
      setStockRows(parsed.items);
      setTotalStockRows(parsed.total);
      setTotalPages(parsed.totalPages);
      setValuationRows(valRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load current stock");
    } finally {
      setListLoading(false);
    }
  }, [branchId, page, debouncedSearch, categoryFilter, locationFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (loading) return;
    loadStock();
  }, [loading, loadStock]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, locationFilter]);

  const retailByCode = useMemo(
    () => new Map(retailPackages.map((r) => [r.product_code, r])),
    [retailPackages],
  );

  const enriched = useMemo(() => {
    const valuationByCode = new Map(valuationRows.map((r) => [r.product_code, r]));

    return stockRows.map((row) => {
      const val = valuationByCode.get(row.product_code);
      const factor = Number(row.conversion_factor ?? 1);
      const uomName = row.uom_name ?? "units";
      const uomObj = {
        full_name: uomName,
        conversion_factor: factor,
      };
      const retailPackage = retailByCode.get(row.product_code) ?? null;
      const cost = Number(val?.last_cost_price ?? 0);
      const sell = Number(val?.unit_price ?? row.wholesale_price ?? 0);
      const shopQty = Number(row.shop_quantity ?? 0);
      const storeQty = Number(row.store_quantity ?? 0);
      const totalBase = shopQty + storeQty;
      const shopValue = stockSellingValue(shopQty, sell, uomObj, retailPackage, false);
      const storeValue = stockSellingValue(storeQty, sell, uomObj, retailPackage, false);
      const profitMargin = sell > 0 ? Math.round(((sell - cost) / sell) * 100) : null;
      const reorderPoint = Number(row.reorder_point ?? 0);

      return {
        product_code: row.product_code,
        product_name: row.product_name,
        shop_quantity: shopQty,
        store_quantity: storeQty,
        total_base_units: totalBase,
        reorder_point: reorderPoint,
        product_alert: row.product_alert ?? (reorderPoint > 0 && totalBase <= reorderPoint ? "REORDER" : "OK"),
        shopDisplay: baseToDisplayQty(shopQty, factor),
        storeDisplay: baseToDisplayQty(storeQty, factor),
        reorderDisplay: baseToDisplayQty(reorderPoint, factor),
        uomName,
        factor,
        uom: uomObj,
        shopValue,
        storeValue,
        profitMargin,
        cost,
        sell,
        sellOnRetail: false,
        retailPackage,
        product: {
          product_code: row.product_code,
          product_name: row.product_name,
          unit_price: sell,
          sell_on_retail: false,
        },
        hasStockRecord: true,
      };
    });
  }, [stockRows, valuationRows, retailByCode]);

  const safePage = Math.min(page, totalPages);
  const pageSlice = enriched;
  const visibleColumns = STOCK_COLUMNS.filter((c) => visibleColumnIds.includes(c.id));

  function toggleColumn(id) {
    const col = STOCK_COLUMNS.find((c) => c.id === id);
    if (col?.required) return;
    setVisibleColumnIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function renderCell(row, colId) {
    switch (colId) {
      case "product":
        return (
          <Link
            href={`/products/${encodeURIComponent(row.product_code)}`}
            className="font-medium text-slate-900 hover:text-[#185FA5]"
          >
            {row.product_name}
          </Link>
        );
      case "sku":
        return <span className="font-mono text-xs text-slate-500">{row.product_code}</span>;
      case "shop":
        return (
          <span title={`${row.shop_quantity} base pieces`}>
            {formatMixedStockDisplay(row.shop_quantity, row.uom ?? row.factor, row.uomName).text}
          </span>
        );
      case "store":
        return (
          <span title={`${row.store_quantity} base pieces`}>
            {formatMixedStockDisplay(row.store_quantity, row.uom ?? row.factor, row.uomName).text}
          </span>
        );
      case "shop_value":
        return formatInventoryKes(row.shopValue);
      case "store_value":
        return formatInventoryKes(row.storeValue);
      case "profit_margin":
        return row.profitMargin != null ? `${row.profitMargin}%` : "—";
      case "reorder":
        return row.reorder_point > 0 ? (
          <>
            {formatQty(row.reorderDisplay)}{" "}
            <span className="text-xs text-slate-400">{row.uomName}</span>
          </>
        ) : (
          "—"
        );
      case "status":
        return (
          <StockHealthBadge
            totalQty={row.total_base_units}
            productAlert={row.product_alert}
          />
        );
      default:
        return "—";
    }
  }

  function generatePriceList() {
    const inStock = pageSlice.filter(
      (row) => Number(row.shop_quantity ?? 0) > 0 || Number(row.store_quantity ?? 0) > 0,
    );
    const rows = inStock.map((row) =>
      priceListRowsForProduct({
        product: row.product,
        uom: row.uom,
        retailPackage: row.retailPackage,
        shopQty: row.shop_quantity,
        storeQty: row.store_quantity,
      }),
    );
    const csv = priceListToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `price-list-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(() => {
    let shop = 0;
    let store = 0;
    for (const row of pageSlice) {
      shop += row.shopValue ?? 0;
      store += row.storeValue ?? 0;
    }
    return { shop, store, all: shop + store };
  }, [pageSlice]);

  return (
    <InventoryPageShell
      title="Current stock"
      subtitle="Quantities in packaging hierarchy — values use retail tier prices when configured"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…"
          className="max-w-md"
        />
        <FilterSelect
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((c) => ({ value: String(c.id), label: c.category_name })),
          ]}
        />
        <FilterSelect
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          options={LOCATION_OPTIONS}
        />
        <button
          type="button"
          onClick={generatePriceList}
          disabled={loading || pageSlice.length === 0}
          className="rounded-lg border border-[#185FA5] bg-[#185FA5] px-3 py-2 text-sm font-medium text-white hover:bg-[#0C447C] disabled:opacity-50"
        >
          Price list (this page)
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setColumnsOpen((o) => !o)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Columns
          </button>
          {columnsOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-48 theme-panel rounded-xl border p-3 shadow-lg">
              <ul className="space-y-1">
                {STOCK_COLUMNS.map((col) => (
                  <li key={col.id}>
                    <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={visibleColumnIds.includes(col.id)}
                        disabled={col.required}
                        onChange={() => toggleColumn(col.id)}
                      />
                      {col.label}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!loading && pageSlice.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          Stock value totals (this page){listLoading ? " · updating…" : ""} — Shop: {formatInventoryKes(totals.shop)} · Store:{" "}
          {formatInventoryKes(totals.store)} · Combined: {formatInventoryKes(totals.all)}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading stock…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    {visibleColumns.map((col) => (
                      <th
                        key={col.id}
                        className={`px-4 py-3 font-medium ${col.align === "right" ? "text-right" : ""}`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-slate-500">
                        No stock records found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr key={row.product_code} className="border-b border-slate-100">
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            className={`px-4 py-3 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                          >
                            {renderCell(row, col.id)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={totalStockRows}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </InventoryTableShell>
    </InventoryPageShell>
  );
}
