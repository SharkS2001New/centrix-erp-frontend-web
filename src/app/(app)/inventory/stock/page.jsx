"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FilterSelect,
  PaginationBar,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import { defaultProductBranchId, isMultiBranchCatalog } from "@/lib/catalog-scope";
import {
  baseToDisplayQty,
  formatInventoryKes,
  formatQty,
  InventoryPageShell,
  InventoryTableShell,
  LOCATION_OPTIONS,
  StockHealthBadge,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import {
  priceListRowsForProduct,
  priceListToCsv,
} from "@/lib/retail-pricing";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import {
  ITEMS_CURRENTLY_IN_STOCK_HREF,
  ITEMS_CURRENTLY_IN_STOCK_LABEL,
} from "@/lib/inventory-routes";
import {
  BatchActionBar,
  TableRowSelectCell,
  TableSelectAllHeader,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";

const COLUMN_STORAGE_KEY = "centrix-erp-inventory-stock-columns";

const STOCK_COLUMNS = [
  { id: "product", label: "Product", defaultVisible: true, required: true },
  { id: "sku", label: "SKU", defaultVisible: false },
  { id: "shop", label: "Shop", defaultVisible: true, align: "right" },
  { id: "store", label: "Store", defaultVisible: true, align: "right" },
  { id: "shop_value", label: "Shop cost", defaultVisible: true, align: "right" },
  { id: "store_value", label: "Store cost", defaultVisible: true, align: "right" },
  { id: "profit_margin", label: "Profit margin", defaultVisible: false, align: "right" },
  { id: "reorder", label: "Reorder", defaultVisible: false, align: "right" },
  { id: "status", label: "Status", defaultVisible: true },
];

const STOCK_EXPORT_COLUMN_DEFS = {
  product: { key: "product_name", label: "Product" },
  sku: { key: "product_code", label: "SKU" },
  shop: { key: "shop", label: "Shop", align: "right" },
  store: { key: "store", label: "Store", align: "right" },
  shop_value: { key: "shop_value", label: "Shop cost", align: "right" },
  store_value: { key: "store_value", label: "Store cost", align: "right" },
  profit_margin: { key: "profit_margin", label: "Profit margin", align: "right" },
  reorder: { key: "reorder", label: "Reorder", align: "right" },
  status: { key: "status", label: "Status" },
};

function enrichStockRow(row) {
  const factor = Number(row.conversion_factor ?? 1);
  const uomName = row.uom_name ?? "units";
  const uomObj = {
    full_name: uomName,
    conversion_factor: factor,
  };
  const cost = Number(row.effective_unit_cost ?? row.last_cost_price ?? 0);
  const sell = Number(row.wholesale_price ?? 0);
  const shopQty = Number(row.shop_quantity ?? 0);
  const storeQty = Number(row.store_quantity ?? 0);
  const totalBase = shopQty + storeQty;
  // Stock value = qty × cost only (not retail/wholesale sell price). Zero qty ⇒ zero value.
  const shopValue = Math.round(shopQty * cost * 100) / 100;
  const storeValue = Math.round(storeQty * cost * 100) / 100;
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
    cost,
    shopValue,
    storeValue,
    profitMargin,
  };
}

function stockRowToExport(row) {
  return {
    product_name: row.product_name,
    product_code: row.product_code,
    shop: formatMixedStockDisplay(row.shop_quantity, row.uom ?? row.factor, row.uomName).text,
    store: formatMixedStockDisplay(row.store_quantity, row.uom ?? row.factor, row.uomName).text,
    shop_value: formatInventoryKes(row.shopValue),
    store_value: formatInventoryKes(row.storeValue),
    profit_margin: row.profitMargin != null ? `${row.profitMargin}%` : "—",
    reorder:
      row.reorder_point > 0 ? `${formatQty(row.reorderDisplay)} ${row.uomName}` : "—",
    status: row.product_alert ?? "OK",
  };
}

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
  const { user, capabilities } = useAuth();
  const multiBranch = isMultiBranchCatalog(capabilities);

  const [stockRows, setStockRows] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [retailPackages, setRetailPackages] = useState([]);
  const [totalStockRows, setTotalStockRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState(defaultVisibleColumnIds);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  useEffect(() => {
    setVisibleColumnIds(readStoredColumnIds());
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      const [subRes, branchRes, retailRes] = await Promise.all([
        apiRequest("/sub-categories", { searchParams: { per_page: 500 } }),
        apiRequest("/branches", { searchParams: { per_page: 200 } }),
        apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }),
      ]);
      const branchRows = branchRes.data ?? [];
      setSubcategories(subRes.data ?? []);
      setBranches(branchRows);
      setRetailPackages(retailRes.data ?? []);
      if (user?.branch_id) {
        setBranchId(String(user.branch_id));
      } else if (branchRows.length === 1) {
        setBranchId(String(branchRows[0].id));
      } else {
        const fallback = defaultProductBranchId(capabilities, user, branchRows);
        if (fallback) setBranchId(fallback);
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load stock filters");
    } finally {
      setLoading(false);
    }
  }, [capabilities, user]);

  const loadStock = useCallback(async () => {
    if (!branchId) return;
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: {
          branch_id: branchId,
          in_stock_only: 1,
          subcategory_id: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
          location: locationFilter !== "all" ? locationFilter : undefined,
        },
      });
      const stockRes = await apiRequest("/reports/stock-on-hand", { searchParams });
      const parsed = parsePaginator(stockRes);
      setStockRows(parsed.items);
      setTotalStockRows(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load current stock");
    } finally {
      setListLoading(false);
    }
  }, [branchId, page, pageSize, debouncedSearch, subcategoryFilter, locationFilter]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (loading || !branchId) return;
    loadStock();
  }, [loading, branchId, loadStock]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, subcategoryFilter, locationFilter, branchId]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const retailByCode = useMemo(
    () => new Map(retailPackages.map((r) => [r.product_code, r])),
    [retailPackages],
  );

  const enriched = useMemo(() => {
    return stockRows.map((row) => {
      const base = enrichStockRow(row);
      return {
        ...base,
        sell: Number(row.wholesale_price ?? 0),
        sellOnRetail: false,
        retailPackage: retailByCode.get(row.product_code) ?? null,
        product: {
          product_code: row.product_code,
          product_name: row.product_name,
          unit_price: Number(row.wholesale_price ?? 0),
          sell_on_retail: false,
        },
        hasStockRecord: true,
      };
    });
  }, [stockRows, retailByCode]);

  const safePage = Math.min(page, totalPages);
  const pageSlice = enriched;
  const visibleColumns = STOCK_COLUMNS.filter((c) => visibleColumnIds.includes(c.id));
  const exportColumns = useMemo(
    () => visibleColumns.map((col) => STOCK_EXPORT_COLUMN_DEFS[col.id]).filter(Boolean),
    [visibleColumns],
  );

  const fetchStockExportRows = useCallback(async () => {
    const searchParams = buildPageParams({
      page: 1,
      perPage: 200,
      q: debouncedSearch,
      extra: {
        branch_id: branchId,
        in_stock_only: 1,
        subcategory_id: subcategoryFilter !== "all" ? subcategoryFilter : undefined,
        location: locationFilter !== "all" ? locationFilter : undefined,
      },
    });
    const stockRes = await apiRequest("/reports/stock-on-hand", { searchParams });
    const rows = parsePaginator(stockRes).items;
    return rows.map((row) => stockRowToExport(enrichStockRow(row)));
  }, [branchId, debouncedSearch, subcategoryFilter, locationFilter]);
  const pageRowIds = useMemo(() => pageSlice.map((row) => row.product_code), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

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

  function generatePriceList(sourceRows = pageSlice) {
    const inStock = sourceRows.filter(
      (row) => Number(row.shop_quantity ?? 0) > 0 || Number(row.store_quantity ?? 0) > 0,
    );
    if (inStock.length === 0) {
      notifyError("No in-stock items in the selection.");
      return;
    }
    const priceListRows = inStock.map((row) =>
      priceListRowsForProduct({
        product: row.product,
        uom: row.uom,
        retailPackage: row.retailPackage,
        shopQty: row.shop_quantity,
        storeQty: row.store_quantity,
      }),
    );
    const csv = priceListToCsv(priceListRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `price-list-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function generateSelectedPriceList() {
    const selected = pageSlice.filter((row) => selectedIds.has(String(row.product_code)));
    if (selected.length === 0) return;
    generatePriceList(selected);
  }

  const subcategoryOptions = useMemo(
    () =>
      [...subcategories]
        .sort((a, b) =>
          String(a.subcategory_name ?? "").localeCompare(String(b.subcategory_name ?? "")),
        )
        .map((sub) => ({
          value: String(sub.id),
          label: sub.subcategory_name ?? `Subcategory #${sub.id}`,
        })),
    [subcategories],
  );

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
      title={ITEMS_CURRENTLY_IN_STOCK_LABEL}
      subtitle="Quantities in packaging hierarchy — stock value is qty × cost price"
      action={
        <CatalogListExport
          title={ITEMS_CURRENTLY_IN_STOCK_LABEL}
          filename="stock-on-hand"
          columns={exportColumns}
          totalCount={totalStockRows}
          getInlineRows={fetchStockExportRows}
          disabled={loading || listLoading || !branchId || exportColumns.length === 0}
        />
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…"
        />
        <Field label="Categories">
          <HrSearchableSelect
            value={subcategoryFilter === "all" ? "" : subcategoryFilter}
            onChange={(value) => setSubcategoryFilter(value || "all")}
            options={subcategoryOptions}
            placeholder="All categories"
            emptyLabel="No subcategories found"
          />
        </Field>
        {multiBranch ? (
          <Field label="Branch">
            <FilterSelect
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: String(b.id),
                label: b.branch_name ?? `Branch #${b.id}`,
              }))}
            />
          </Field>
        ) : null}
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

      {!loading && pageSlice.length > 0 ? (
        <p className="mb-3 text-xs text-slate-500">
          Stock cost totals (this page){listLoading ? " · updating…" : ""} — Shop: {formatInventoryKes(totals.shop)} · Store:{" "}
          {formatInventoryKes(totals.store)} · Combined: {formatInventoryKes(totals.all)}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading || !branchId ? (
          <p className="p-8 text-sm text-slate-500">
            {loading ? "Loading stock…" : "Select a branch to view stock."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
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
                      <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-500">
                        No stock records found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => (
                      <tr key={row.product_code} className="border-b border-slate-100">
                        <TableRowSelectCell
                          checked={selectedIds.has(String(row.product_code))}
                          onChange={() => toggleOne(row.product_code)}
                          label={`Select ${row.product_name}`}
                        />
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
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </InventoryTableShell>

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <button
          type="button"
          disabled={selectedCount === 0}
          onClick={generateSelectedPriceList}
          className="rounded-lg bg-[#185FA5] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#0C447C] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Price list (selected)
        </button>
      </BatchActionBar>
    </InventoryPageShell>
  );
}
