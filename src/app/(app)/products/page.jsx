"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

const PAGE_SIZE = 10;
const COLUMN_STORAGE_KEY = "pos-erp-products-visible-columns";

const PRODUCT_COLUMNS = [
  { id: "product", label: "Product name", defaultVisible: true, required: true },
  { id: "unit_price", label: "Unit price", defaultVisible: true, align: "right" },
  { id: "cost_price", label: "Cost price", defaultVisible: true, align: "right" },
  { id: "discount", label: "Discount", defaultVisible: true },
  { id: "weight", label: "Weight", defaultVisible: false, align: "right" },
  { id: "shop", label: "Shop", defaultVisible: true, align: "center", sortable: true },
  { id: "store", label: "Store", defaultVisible: true, align: "center" },
  { id: "reorder", label: "Reorder", defaultVisible: false, align: "right" },
  { id: "supplier", label: "Supplier", defaultVisible: true },
  { id: "vat", label: "VAT", defaultVisible: true },
  { id: "pricing", label: "Pricing", defaultVisible: true },
  { id: "alert", label: "Alert", defaultVisible: false },
  { id: "updated", label: "Updated", defaultVisible: true },
  { id: "actions", label: "Actions", defaultVisible: true, required: true, align: "center" },
];

function defaultVisibleColumnIds() {
  return PRODUCT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

function normalizeColumnIds(ids) {
  const valid = new Set(PRODUCT_COLUMNS.map((c) => c.id));
  const normalized = (ids ?? []).filter((id) => valid.has(id));
  for (const col of PRODUCT_COLUMNS) {
    if (col.required && !normalized.includes(col.id)) normalized.push(col.id);
  }
  return normalized.length ? normalized : defaultVisibleColumnIds();
}

function readStoredColumnIds() {
  if (typeof window === "undefined") return defaultVisibleColumnIds();
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultVisibleColumnIds();
    return normalizeColumnIds(JSON.parse(raw));
  } catch {
    return defaultVisibleColumnIds();
  }
}

function alignClass(align) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function formatKes(value) {
  if (value == null || value === "") return "—";
  return `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

function formatDiscount(product) {
  const pct = Number(product.discount_percentage ?? 0);
  const val = Number(product.discount_value ?? 0);
  if (!product.discount_type || (pct === 0 && val === 0)) return "—";
  if (product.discount_type === "percentage") return `${pct}%`;
  return formatKes(val);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function locationStockStatus(qty, product) {
  const reorder = Number(product.reorder_point ?? 0);
  if (qty <= 0) return "out_of_stock";
  if (product.low_stock_alert_enabled && qty <= reorder) return "low_stock";
  return "in_stock";
}

function vatTreatment(vat) {
  if (!vat) return "—";
  const code = String(vat.vat_code ?? "").toUpperCase();
  if (code === "V") return "Vatable";
  return "Invatable";
}

function resolveWeight(product, uom, retailPackage) {
  if (product.product_weight != null && product.product_weight !== "") {
    return Number(product.product_weight);
  }
  if (retailPackage?.max_qty_measure != null && retailPackage?.max_uom_measure === "kg") {
    return Number(retailPackage.max_qty_measure);
  }
  if (uom && !uom.is_base_unit && uom.conversion_factor) {
    return Number(uom.conversion_factor);
  }
  if (retailPackage?.max_qty_measure != null) {
    return Number(retailPackage.max_qty_measure);
  }
  return null;
}

function enrichProduct(product, subById, catById, vatById, uomById, supplierById, userById, retailByCode) {
  const sub = subById.get(product.subcategory_id);
  const cat = sub ? catById.get(sub.category_id) : null;
  const vat = vatById.get(product.vat_id);
  const uom = uomById.get(product.unit_id);
  const supplier = supplierById.get(product.supplier_id);
  const retailPackage = retailByCode.get(product.product_code);
  const updater = userById.get(product.updated_by);
  const shop = Number(product.stock_in_shop ?? 0);
  const store = Number(product.stock_in_store ?? 0);
  const reorder = Number(product.reorder_point ?? 0);
  const isActive = !product.deleted_at;
  const uomLabel = uom?.uom_type || uom?.full_name || "—";

  let stockStatus = "in_stock";
  if (shop + store <= 0) stockStatus = "out_of_stock";
  else if (product.low_stock_alert_enabled && shop <= reorder) stockStatus = "low_stock";

  let pricing = "Both";
  if (product.sell_on_retail === 1 || product.sell_on_retail === true) pricing = "Retail";
  else if (product.sell_on_retail === 0 || product.sell_on_retail === false) pricing = "Wholesale";

  return {
    ...product,
    category_id: cat?.id,
    category_name: cat?.category_name ?? "Uncategorised",
    subcategory_name: sub?.subcategory_name ?? "General",
    vat_rate: vat?.vat_percentage,
    vat_code: vat?.vat_code,
    vat_treatment: vatTreatment(vat),
    uom_label: uom?.full_name ?? "—",
    uom_type: uomLabel,
    uom_factor: Number(uom?.conversion_factor ?? 1),
    supplier_name: supplier?.supplier_name ?? "—",
    updated_by_name: updater?.full_name ?? updater?.username ?? "—",
    display_weight: resolveWeight(product, uom, retailPackage),
    is_active: isActive,
    stock_status: stockStatus,
    shop_stock_status: locationStockStatus(shop, product),
    store_stock_status: locationStockStatus(store, product),
    pricing,
    shop_qty: shop,
    store_qty: store,
  };
}

function groupProducts(products) {
  const tree = new Map();
  for (const p of products) {
    if (!tree.has(p.category_name)) tree.set(p.category_name, new Map());
    const subs = tree.get(p.category_name);
    if (!subs.has(p.subcategory_name)) subs.set(p.subcategory_name, []);
    subs.get(p.subcategory_name).push(p);
  }
  return tree;
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [vats, setVats] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [users, setUsers] = useState([]);
  const [retailPackages, setRetailPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [collapsed, setCollapsed] = useState(new Set());
  const [visibleColumnIds, setVisibleColumnIds] = useState(defaultVisibleColumnIds);
  const [columnsOpen, setColumnsOpen] = useState(false);

  useEffect(() => {
    setVisibleColumnIds(readStoredColumnIds());
  }, []);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

  const visibleColumns = useMemo(
    () =>
      visibleColumnIds
        .map((id) => PRODUCT_COLUMNS.find((c) => c.id === id))
        .filter(Boolean),
    [visibleColumnIds],
  );

  const tableColCount = 1 + visibleColumns.length;

  useEffect(() => {
    Promise.all([
      apiRequest("/products", { searchParams: { per_page: 200 } }),
      apiRequest("/categories", { searchParams: { per_page: 200 } }),
      apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
      apiRequest("/vats", { searchParams: { per_page: 50 } }),
      apiRequest("/uoms", { searchParams: { per_page: 100 } }),
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/users", { searchParams: { per_page: 200 } }),
      apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }),
    ])
      .then(([prodRes, catRes, subRes, vatRes, uomRes, supRes, userRes, retailRes]) => {
        setProducts(prodRes.data ?? []);
        setCategories(catRes.data ?? []);
        setSubCategories(subRes.data ?? []);
        setVats(vatRes.data ?? []);
        setUoms(uomRes.data ?? []);
        setSuppliers(supRes.data ?? []);
        setUsers(userRes.data ?? []);
        setRetailPackages(retailRes.data ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const subById = useMemo(
    () => new Map(subCategories.map((s) => [s.id, s])),
    [subCategories],
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);
  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const retailByCode = useMemo(
    () => new Map(retailPackages.map((r) => [r.product_code, r])),
    [retailPackages],
  );

  const enriched = useMemo(
    () =>
      products.map((p) =>
        enrichProduct(
          p,
          subById,
          catById,
          vatById,
          uomById,
          supplierById,
          userById,
          retailByCode,
        ),
      ),
    [products, subById, catById, vatById, uomById, supplierById, userById, retailByCode],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((p) => {
      if (q && !p.product_name?.toLowerCase().includes(q) && !p.product_code?.toLowerCase().includes(q)) {
        return false;
      }
      if (categoryFilter !== "all" && String(p.category_id) !== categoryFilter) return false;
      if (subCategoryFilter !== "all" && String(p.subcategory_id) !== subCategoryFilter) return false;
      if (stockFilter !== "all" && p.stock_status !== stockFilter) return false;
      if (pricingFilter !== "all" && p.pricing.toLowerCase() !== pricingFilter) return false;
      if (activeFilter === "active" && !p.is_active) return false;
      if (activeFilter === "inactive" && p.is_active) return false;
      return true;
    });
  }, [enriched, search, categoryFilter, subCategoryFilter, stockFilter, pricingFilter, activeFilter]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const active = enriched.filter((p) => p.is_active).length;
    const lowStock = enriched.filter((p) => p.stock_status === "low_stock").length;
    const outOfStock = enriched.filter((p) => p.stock_status === "out_of_stock").length;
    return {
      total,
      active,
      activePct: total ? ((active / total) * 100).toFixed(1) : "0",
      lowStock,
      outOfStock,
    };
  }, [enriched]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const grouped = useMemo(() => groupProducts(pageSlice), [pageSlice]);
  const showCategoryHeaders = categoryFilter === "all";

  const subCategoryOptions = useMemo(() => {
    if (categoryFilter === "all") return subCategories;
    return subCategories.filter((s) => String(s.category_id) === categoryFilter);
  }, [subCategories, categoryFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, subCategoryFilter, stockFilter, pricingFilter, activeFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function toggleAll(checked) {
    if (checked) setSelected(new Set(pageSlice.map((p) => p.product_code)));
    else setSelected(new Set());
  }

  function toggleOne(code) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleSection(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isCollapsed(key) {
    return collapsed.has(key);
  }

  function toggleColumn(id) {
    const col = PRODUCT_COLUMNS.find((c) => c.id === id);
    if (!col || col.required) return;
    setVisibleColumnIds((prev) => {
      if (prev.includes(id)) {
        if (prev.filter((x) => x !== id).length < 1) return prev;
        return prev.filter((x) => x !== id);
      }
      const next = [...prev, id];
      return PRODUCT_COLUMNS.filter((c) => next.includes(c.id)).map((c) => c.id);
    });
  }

  function resetColumns() {
    setVisibleColumnIds(defaultVisibleColumnIds());
  }

  const allOnPageSelected =
    pageSlice.length > 0 && pageSlice.every((p) => selected.has(p.product_code));

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage catalogue items, pricing and stock levels
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ImportIcon />
            Import
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ExportIcon />
            Export
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
          >
            <PlusIcon />
            Add product
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total products" value={stats.total} hint="across all categories" />
        <StatCard
          label="Active"
          value={stats.active}
          hint={`${stats.activePct}% of catalogue`}
        />
        <StatCard label="Low stock" value={stats.lowStock} hint="below reorder point" />
        <StatCard label="Out of stock" value={stats.outOfStock} hint="zero units on hand" />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setSubCategoryFilter("all");
            }}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: String(c.id), label: c.category_name })),
            ]}
          />
          <FilterSelect
            value={subCategoryFilter}
            onChange={(e) => setSubCategoryFilter(e.target.value)}
            options={[
              { value: "all", label: "All sub-categories" },
              ...subCategoryOptions.map((s) => ({
                value: String(s.id),
                label: s.subcategory_name,
              })),
            ]}
          />
          <FilterSelect
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            options={[
              { value: "all", label: "All stock status" },
              { value: "in_stock", label: "In stock" },
              { value: "low_stock", label: "Low stock" },
              { value: "out_of_stock", label: "Out of stock" },
            ]}
          />
          <FilterSelect
            value={pricingFilter}
            onChange={(e) => setPricingFilter(e.target.value)}
            options={[
              { value: "all", label: "All pricing" },
              { value: "retail", label: "Retail" },
              { value: "wholesale", label: "Wholesale" },
              { value: "both", label: "Both" },
            ]}
          />
          <FilterSelect
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            options={[
              { value: "all", label: "All products" },
              { value: "active", label: "Active only" },
              { value: "inactive", label: "Inactive only" },
            ]}
          />
          <ColumnPicker
            open={columnsOpen}
            onToggle={() => setColumnsOpen((v) => !v)}
            onClose={() => setColumnsOpen(false)}
            visibleColumnIds={visibleColumnIds}
            onToggleColumn={toggleColumn}
            onReset={resetColumns}
          />
        </div>
      </div>

      {loading && <p className="mt-8 text-sm text-slate-500">Loading products…</p>}
      {error && (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                  </th>
                  {visibleColumns.map((col) => (
                    <th key={col.id} className={`px-3 py-3 ${alignClass(col.align)}`}>
                      {col.sortable ? (
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          <SortIcon />
                        </span>
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageSlice.length === 0 ? (
                  <tr>
                    <td colSpan={tableColCount} className="px-4 py-12 text-center text-slate-500">
                      No products match your filters.
                    </td>
                  </tr>
                ) : (
                  [...grouped.entries()].map(([categoryName, subMap]) => (
                    <CategoryGroup
                      key={categoryName}
                      categoryName={categoryName}
                      subMap={subMap}
                      showCategoryHeader={showCategoryHeaders}
                      selected={selected}
                      onToggle={toggleOne}
                      isCollapsed={isCollapsed}
                      onToggleSection={toggleSection}
                      visibleColumns={visibleColumns}
                      tableColCount={tableColCount}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
            <p>
              Showing{" "}
              {filtered.length === 0
                ? "0"
                : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)}`}{" "}
              of {filtered.length} products
            </p>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  categoryName,
  subMap,
  showCategoryHeader,
  selected,
  onToggle,
  isCollapsed,
  onToggleSection,
  visibleColumns,
  tableColCount,
}) {
  const categoryKey = `category:${categoryName}`;
  const categoryCollapsed = isCollapsed(categoryKey);
  const productCount = [...subMap.values()].reduce((n, items) => n + items.length, 0);

  return (
    <>
      {showCategoryHeader && (
        <tr className="bg-slate-100/80">
          <td colSpan={tableColCount} className="px-4 py-2.5">
            <button
              type="button"
              onClick={() => onToggleSection(categoryKey)}
              className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              <ChevronToggle expanded={!categoryCollapsed} />
              {categoryName}
              <span className="font-normal normal-case text-slate-400">
                ({productCount} products)
              </span>
            </button>
          </td>
        </tr>
      )}
      {!categoryCollapsed &&
        [...subMap.entries()].map(([subName, items]) => (
          <SubCategoryGroup
            key={`${categoryName}-${subName}`}
            categoryName={categoryName}
            subName={subName}
            items={items}
            selected={selected}
            onToggle={onToggle}
            isCollapsed={isCollapsed}
            onToggleSection={onToggleSection}
            showCategoryHeader={showCategoryHeader}
            visibleColumns={visibleColumns}
            tableColCount={tableColCount}
          />
        ))}
    </>
  );
}

function SubCategoryGroup({
  categoryName,
  subName,
  items,
  selected,
  onToggle,
  isCollapsed,
  onToggleSection,
  showCategoryHeader,
  visibleColumns,
  tableColCount,
}) {
  const subKey = `subcategory:${categoryName}/${subName}`;
  const subCollapsed = isCollapsed(subKey);

  return (
    <>
      <tr className="bg-blue-50/60">
        <td colSpan={tableColCount} className="px-4 py-2">
          <button
            type="button"
            onClick={() => onToggleSection(subKey)}
            className={`flex w-full items-center gap-2 text-left text-xs font-medium text-blue-800 ${showCategoryHeader ? "pl-4" : ""}`}
          >
            <ChevronToggle expanded={!subCollapsed} />
            {subName}
            <span className="font-normal text-blue-600/70">({items.length})</span>
          </button>
        </td>
      </tr>
      {!subCollapsed &&
        items.map((p) => (
          <ProductRow
            key={p.product_code}
            product={p}
            checked={selected.has(p.product_code)}
            onToggle={() => onToggle(p.product_code)}
            visibleColumns={visibleColumns}
          />
        ))}
    </>
  );
}

function ProductRow({ product, checked, onToggle, visibleColumns }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/80">
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="rounded border-slate-300"
        />
      </td>
      {visibleColumns.map((col) => (
        <td key={col.id} className={`px-3 py-3 ${alignClass(col.align)}`}>
          {renderProductCell(product, col.id)}
        </td>
      ))}
    </tr>
  );
}

function renderProductCell(product, columnId) {
  switch (columnId) {
    case "product":
      return (
        <>
          <p className="font-medium text-slate-900">{product.product_name}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{product.product_code}</p>
        </>
      );
    case "unit_price":
      return <span className="text-slate-700">{formatKes(product.unit_price)}</span>;
    case "cost_price":
      return <span className="text-slate-500">{formatKes(product.last_cost_price)}</span>;
    case "discount":
      return <span className="text-slate-600">{formatDiscount(product)}</span>;
    case "weight":
      return (
        <span className="text-slate-600">
          {product.display_weight != null ? `${formatQty(product.display_weight)} kg` : "—"}
        </span>
      );
    case "shop":
      return (
        <StockCell
          qty={product.shop_qty}
          unit={product.uom_type}
          status={product.shop_stock_status}
        />
      );
    case "store":
      return (
        <StockCell
          qty={product.store_qty}
          unit={product.uom_type}
          status={product.store_stock_status}
        />
      );
    case "reorder":
      return product.reorder_point != null ? (
        <>
          {formatQty(product.reorder_point)}{" "}
          <span className="text-xs text-slate-400">{product.uom_type}</span>
        </>
      ) : (
        "—"
      );
    case "supplier":
      return <span className="text-slate-600">{product.supplier_name}</span>;
    case "vat":
      return <VatBadge treatment={product.vat_treatment} />;
    case "pricing":
      return <PricingBadge type={product.pricing} />;
    case "alert":
      return <AlertBadge enabled={product.low_stock_alert_enabled} />;
    case "updated":
      return <UpdatedByCell name={product.updated_by_name} date={product.updated_at} />;
    case "actions":
      return (
        <div className="flex items-center justify-center gap-1">
          <ActionButton label="View product" className="text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <EyeIcon />
          </ActionButton>
          <ActionButton label="Edit product" className="text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <PencilIcon />
          </ActionButton>
          <ActionButton label="Delete product" className="text-red-500 hover:bg-red-50 hover:text-red-600">
            <TrashIcon />
          </ActionButton>
        </div>
      );
    default:
      return "—";
  }
}

function ColumnPicker({
  open,
  onToggle,
  onClose,
  visibleColumnIds,
  onToggleColumn,
  onReset,
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <ColumnsIcon />
        Columns
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close column picker"
            onClick={onClose}
          />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Show columns
              </p>
              <button
                type="button"
                onClick={onReset}
                className="text-xs font-medium text-blue-600 hover:text-blue-500"
              >
                Reset
              </button>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {PRODUCT_COLUMNS.map((col) => {
                const checked = visibleColumnIds.includes(col.id);
                return (
                  <li key={col.id}>
                    <label
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        col.required ? "cursor-not-allowed text-slate-400" : "cursor-pointer hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={col.required}
                        onChange={() => onToggleColumn(col.id)}
                        className="rounded border-slate-300"
                      />
                      {col.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function UpdatedByCell({ name, date }) {
  return (
    <div>
      <p className="font-medium text-slate-800">{name}</p>
      <p className="text-xs text-slate-500">{formatDate(date)}</p>
    </div>
  );
}

function VatBadge({ treatment }) {
  if (treatment === "—") return <span className="text-slate-400">—</span>;
  const vatable = treatment === "Vatable";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
        vatable
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-slate-100 text-slate-600 ring-slate-300/50"
      }`}
    >
      {treatment}
    </span>
  );
}

function AlertBadge({ enabled }) {
  return enabled ? (
    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
      On
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-300/50">
      Off
    </span>
  );
}

function StockCell({ qty, unit, status }) {
  const styles = {
    in_stock: {
      label: "In stock",
      number: "text-emerald-600",
      text: "text-emerald-600",
    },
    low_stock: {
      label: "Low stock",
      number: "text-amber-600",
      text: "text-amber-600",
    },
    out_of_stock: {
      label: "Out of stock",
      number: "text-red-600",
      text: "text-red-600",
    },
  };
  const s = styles[status] ?? styles.in_stock;

  return (
    <div className="text-center">
      <p className={`text-base font-semibold leading-tight ${s.number}`}>
        {formatQty(qty)}
        <span className="ml-1 text-xs font-normal capitalize">{unit}</span>
      </p>
      <p className={`text-xs ${s.text}`}>{s.label}</p>
    </div>
  );
}

function ActionButton({ label, className, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`rounded-lg p-1.5 transition ${className}`}
    >
      {children}
    </button>
  );
}

function ChevronToggle({ expanded }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500">
      {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </span>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PricingBadge({ type }) {
  const styles = {
    Both: "bg-sky-50 text-sky-700 ring-sky-600/20",
    Retail: "bg-violet-50 text-violet-700 ring-violet-600/20",
    Wholesale: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[type] ?? styles.Both}`}
    >
      {type}
    </span>
  );
}

function Pagination({ page, totalPages, onChange }) {
  const pages = buildPageNumbers(page, totalPages);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        aria-label="Previous page"
      >
        <ChevronLeftIcon />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium ${
              p === page
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        aria-label="Next page"
      >
        <ChevronRightIcon />
      </button>
    </div>
  );
}

function buildPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

function SearchIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
      <path d="M8 9l4-4 4 4" />
      <path d="M8 15l4 4 4-4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
