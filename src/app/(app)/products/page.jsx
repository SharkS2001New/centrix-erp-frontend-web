"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAppRouter } from "@/lib/use-app-router";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { DeleteProductDialog } from "@/components/products/delete-product-dialog";
import { ProductImportExport } from "@/components/products/product-import-export";
import {
  KraProductUploadToolbar,
  submitKraProductRegistration,
} from "@/components/products/kra-product-upload-bar";
import { useQueuedTask } from "@/lib/use-queued-task";
import { baseToDisplayQty, formatMixedStockDisplay } from "@/lib/stock-uom";
import {
  FilterSelect,
  FilterToolbar,
  formatShortDate,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  SECONDARY_BTN_CLASS,
  StatCard,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SECTION_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TABLE_SUBSECTION_ROW_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { resolveProductAudit } from "@/lib/product-audit";
import { PermissionGate } from "@/components/permission-gate";
import { P } from "@/lib/permission-codes";
import { isKraDeviceEnabled } from "@/lib/finance-settings";
import { productScopeLabel, isMultiBranchCatalog, defaultProductBranchId } from "@/lib/catalog-scope";
import { useAuth } from "@/contexts/auth-context";
import { loadReferenceDataPhased, fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  TableTreeCornerIcon,
  runSequentialDeletes,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";

const PAGE_SIZE = 10;
const COLUMN_STORAGE_KEY = "centrix-erp-products-visible-columns";

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
  { id: "alert", label: "Reorder", defaultVisible: false },
  { id: "updated", label: "Updated by", defaultVisible: true },
  { id: "actions", label: "Actions", defaultVisible: true, required: true, align: "center" },
];

function defaultVisibleColumnIds() {
  return PRODUCT_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
}

function normalizeColumnIds(ids) {
  if (!Array.isArray(ids)) {
    return defaultVisibleColumnIds();
  }
  const valid = new Set(PRODUCT_COLUMNS.map((c) => c.id));
  const normalized = ids.filter((id) => valid.has(id));
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
  const type = product.discount_type === "fixed" ? "fixed" : "percentage";
  const pct = Number(product.discount_percentage ?? 0);
  const val = Number(product.discount_value ?? 0);
  if (type === "fixed") {
    if (val === 0) return "—";
    return formatKes(val);
  }
  if (pct === 0) return "—";
  return `${pct}%`;
}

function effectiveReorderPoint(product, globalThreshold) {
  const rp = Number(product.reorder_point ?? 0);
  return rp > 0 ? rp : Number(globalThreshold ?? 0);
}


function UserDateCell({ name, date }) {
  return (
    <div>
      <p className="font-medium text-[var(--theme-text)]">{name || "—"}</p>
      <p className="theme-subtext text-xs">{formatShortDate(date)}</p>
    </div>
  );
}

function locationStockStatus(qty, reorderPoint) {
  if (qty <= 0) return "out_of_stock";
  if (reorderPoint > 0 && qty <= reorderPoint) return "low_stock";
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
  if (uom && Number(uom.conversion_factor ?? 1) > 1) {
    return Number(uom.conversion_factor);
  }
  if (retailPackage?.max_qty_measure != null) {
    return Number(retailPackage.max_qty_measure);
  }
  return null;
}

function enrichProduct(
  product,
  subById,
  catById,
  vatById,
  uomById,
  supplierById,
  retailByCode,
  globalThreshold,
) {
  const sub = subById.get(String(product.subcategory_id ?? ""));
  const cat = sub ? catById.get(String(sub.category_id ?? "")) : null;
  const vat = vatById.get(String(product.vat_id ?? ""));
  const uom = uomById.get(String(product.unit_id ?? ""));
  const supplier = supplierById.get(String(product.supplier_id ?? ""));
  const retailPackage = retailByCode.get(product.product_code);
  const shop = Number(product.stock_in_shop ?? 0);
  const store = Number(product.stock_in_store ?? 0);
  const reorderPoint = effectiveReorderPoint(product, globalThreshold);
  const isActive = !product.deleted_at;
  const uomLabel = uom?.uom_type || uom?.full_name || "—";

  let stockStatus = "in_stock";
  if (shop + store <= 0) stockStatus = "out_of_stock";
  else if (reorderPoint > 0 && shop + store <= reorderPoint) stockStatus = "low_stock";

  const pricing =
    product.sell_on_retail === 1 || product.sell_on_retail === true ? "Sells W/R" : "Wholesale";

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
    product_uom: uom ?? null,
    supplier_name: supplier?.supplier_name ?? "—",
    display_weight: resolveWeight(product, uom, retailPackage),
    is_active: isActive,
    effective_reorder_point: reorderPoint,
    uses_global_reorder: Number(product.reorder_point ?? 0) <= 0,
    stock_status: stockStatus,
    shop_stock_status: locationStockStatus(shop, reorderPoint),
    store_stock_status: locationStockStatus(store, reorderPoint),
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
  const router = useAppRouter();
  const confirm = useConfirm();
  const { capabilities, user } = useAuth();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const kraDeviceEnabled = isKraDeviceEnabled(capabilities?.module_settings, capabilities);
  const selectionEnabled = true;
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [catalogStats, setCatalogStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [vats, setVats] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [retailPackages, setRetailPackages] = useState([]);
  const [globalReorderThreshold, setGlobalReorderThreshold] = useState(null);
  const [branches, setBranches] = useState([]);
  const [stockBranchId, setStockBranchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [referenceWarning, setReferenceWarning] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subCategoryFilter, setSubCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [page, setPage] = useState(1);
  const {
    selectedIds: selected,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [kraUploadBusy, setKraUploadBusy] = useState(false);
  const [kraUploadMessage, setKraUploadMessage] = useState(null);
  const [kraUploadError, setKraUploadError] = useState(null);
  const { runQueuedTask: runKraTask, overlayNode: kraOverlay } = useQueuedTask(
    "Please wait while products are registered on the KRA device…",
  );
  const [collapsed, setCollapsed] = useState(new Set());
  const [visibleColumnIds, setVisibleColumnIds] = useState(() => defaultVisibleColumnIds());
  const [columnsOpen, setColumnsOpen] = useState(false);

  const effectiveStockBranchId = useMemo(() => {
    if (user?.branch_id) return Number(user.branch_id);
    const parsed = Number(stockBranchId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [user?.branch_id, stockBranchId]);

  useEffect(() => {
    if (user?.branch_id) {
      setStockBranchId(String(user.branch_id));
      return;
    }
    if (!stockBranchId) {
      const fallback = defaultProductBranchId(capabilities, user, branches);
      if (fallback) setStockBranchId(fallback);
    }
  }, [user?.branch_id, capabilities, user, branches, stockBranchId]);

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

  const loadReferenceData = useCallback(async () => {
    setReferenceWarning(null);
    try {
      const { criticalResults, deferredResults } = await loadReferenceDataPhased({
        critical: [
          () => apiRequest("/categories", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
          () => apiRequest("/sub-categories", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
          () => apiRequest("/branches", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
        ],
        deferred: [
          () => apiRequest("/users", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
          () => apiRequest("/vats", { searchParams: { per_page: 50 } }).catch(() => ({ data: [] })),
          () => apiRequest("/uoms", { searchParams: { per_page: 100 } }).catch(() => ({ data: [] })),
          () => apiRequest("/suppliers", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
          () =>
            apiRequest("/retail-package-settings", { searchParams: { per_page: 200 } }).catch(() => ({
              data: [],
            })),
          () => apiRequest("/system-settings", { searchParams: { per_page: 1 } }).catch(() => null),
        ],
        concurrency: 3,
      });

      const [catRes, subRes, branchRes] = criticalResults;
      const [userRes, vatRes, uomRes, supRes, retailRes, settingsRes] = deferredResults;

      setUsers(userRes.data ?? []);
      setCategories(catRes.data ?? []);
      setSubCategories(subRes.data ?? []);
      setVats(vatRes.data ?? []);
      setUoms(uomRes.data ?? []);
      setSuppliers(supRes.data ?? []);
      setRetailPackages(retailRes.data ?? []);
      setBranches(branchRes.data ?? []);
      const settingsRows = settingsRes?.data ?? settingsRes ?? [];
      const settings = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
      const threshold = settings?.global_low_stock_threshold;
      setGlobalReorderThreshold(
        threshold != null && threshold !== "" ? Number(threshold) : null,
      );
    } catch (e) {
      setReferenceWarning(
        e instanceof Error ? e.message : "Some catalogue filters could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalogStats = useCallback(async () => {
    try {
      const statsRes = await apiRequest("/products/catalog-summary", {
        searchParams: effectiveStockBranchId ? { branch_id: effectiveStockBranchId } : {},
      });
      setCatalogStats(statsRes);
    } catch {
      setCatalogStats(null);
    }
  }, [effectiveStockBranchId]);

  const loadProducts = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: PAGE_SIZE,
        q: debouncedSearch,
        filters: {
          subcategory_id: subCategoryFilter !== "all" ? subCategoryFilter : undefined,
          category_id: categoryFilter !== "all" ? categoryFilter : undefined,
        },
        extra: {
          status:
            activeFilter === "inactive" ? "inactive" : activeFilter === "all" ? "all" : "active",
          stock_status: stockFilter !== "all" ? stockFilter : undefined,
          pricing: pricingFilter !== "all" ? pricingFilter : undefined,
          branch_id: effectiveStockBranchId ?? undefined,
        },
      });
      const prodRes = await apiRequest("/products", { searchParams });
      const parsed = parsePaginator(prodRes);
      setProducts(parsed.items);
      setTotalProducts(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setListLoading(false);
    }
  }, [
    page,
    debouncedSearch,
    categoryFilter,
    subCategoryFilter,
    stockFilter,
    pricingFilter,
    activeFilter,
    effectiveStockBranchId,
  ]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      loadReferenceData(),
      loadProducts(),
      loadCatalogStats(),
    ]);
  }, [loadReferenceData, loadProducts, loadCatalogStats]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (loading) return;
    loadProducts();
    loadCatalogStats();
  }, [loading, loadProducts, loadCatalogStats]);

  function openDeleteDialog(product) {
    setDeletingProduct(product);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deletingProduct) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await apiRequest(`/products/${encodeURIComponent(deletingProduct.product_code)}`, {
        method: "DELETE",
      });
      setDeleteOpen(false);
      setDeletingProduct(null);
      await reloadAll();
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeleteSaving(false);
    }
  }

  const subById = useMemo(
    () => new Map(subCategories.map((s) => [String(s.id), s])),
    [subCategories],
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [String(c.id), c])),
    [categories],
  );
  const vatById = useMemo(() => new Map(vats.map((v) => [String(v.id), v])), [vats]);
  const uomById = useMemo(() => new Map(uoms.map((u) => [String(u.id), u])), [uoms]);
  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [String(s.id), s])),
    [suppliers],
  );
  const retailByCode = useMemo(
    () => new Map(retailPackages.map((r) => [r.product_code, r])),
    [retailPackages],
  );
  const userById = useMemo(() => new Map(users.map((u) => [String(u.id), u])), [users]);

  const enriched = useMemo(
    () =>
      products.map((p) => {
        const row = enrichProduct(
          p,
          subById,
          catById,
          vatById,
          uomById,
          supplierById,
          retailByCode,
          globalReorderThreshold,
        );
        const audit = resolveProductAudit(p, userById);
        return {
          ...row,
          audit_name: audit.name,
          audit_date: audit.date,
        };
      }),
    [
      products,
      subById,
      catById,
      vatById,
      uomById,
      supplierById,
      retailByCode,
      globalReorderThreshold,
      userById,
    ],
  );

  const buildExportSearchParams = useCallback(() => {
    return buildPageParams({
      page: 1,
      perPage: 200,
      q: debouncedSearch,
      filters: {
        subcategory_id: subCategoryFilter !== "all" ? subCategoryFilter : undefined,
        category_id: categoryFilter !== "all" ? categoryFilter : undefined,
      },
      extra: {
        status:
          activeFilter === "inactive" ? "inactive" : activeFilter === "all" ? "all" : "active",
        stock_status: stockFilter !== "all" ? stockFilter : undefined,
        pricing: pricingFilter !== "all" ? pricingFilter : undefined,
        branch_id: effectiveStockBranchId ?? undefined,
      },
    });
  }, [
    activeFilter,
    categoryFilter,
    debouncedSearch,
    effectiveStockBranchId,
    pricingFilter,
    stockFilter,
    subCategoryFilter,
  ]);

  const stats = useMemo(() => {
    const total = catalogStats?.total ?? totalProducts;
    const active = catalogStats?.active ?? total;
    return {
      total,
      active,
      activePct: total ? ((active / total) * 100).toFixed(1) : "0",
      lowStock: catalogStats?.low_stock ?? 0,
      outOfStock: catalogStats?.out_of_stock ?? 0,
    };
  }, [catalogStats, totalProducts]);

  const safePage = Math.min(page, totalPages);
  const pageSlice = enriched;
  const grouped = useMemo(() => groupProducts(pageSlice), [pageSlice]);
  const showCategoryHeaders = categoryFilter === "all";
  const pageRowIds = useMemo(() => pageSlice.map((p) => p.product_code), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  const subCategoryOptions = useMemo(() => {
    if (categoryFilter === "all") return subCategories;
    return subCategories.filter((s) => String(s.category_id) === categoryFilter);
  }, [subCategories, categoryFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, subCategoryFilter, stockFilter, pricingFilter, activeFilter, effectiveStockBranchId]);

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

  function clearKraSelection() {
    clearSelection();
  }

  async function deleteSelectedProducts() {
    const ids = [...selected];
    if (ids.length === 0) return;

    const ok = await confirm({
      title: "Delete selected products",
      message: `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBatchDeleting(true);
    try {
      const byCode = new Map(pageSlice.map((p) => [String(p.product_code), p]));
      const { succeeded, failed } = await runSequentialDeletes({
        ids,
        deleteItem: async (productCode) => {
          await apiRequest(`/products/${encodeURIComponent(productCode)}`, { method: "DELETE" });
        },
      });

      clearSelection();
      await reloadAll();

      if (failed.length === 0) {
        notifySuccess(`Deleted ${succeeded.length} product${succeeded.length === 1 ? "" : "s"}`);
      } else if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Delete failed");
      } else {
        const names = failed
          .slice(0, 3)
          .map((f) => byCode.get(String(f.id))?.product_name ?? f.id)
          .join(", ");
        notifyError(
          `Deleted ${succeeded.length}; ${failed.length} failed${names ? ` (${names})` : ""}`,
        );
      }
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleKraUploadSelected() {
    if (selected.size === 0) {
      setKraUploadError("Select at least one product.");
      return;
    }
    setKraUploadBusy(true);
    setKraUploadMessage(null);
    setKraUploadError(null);
    try {
      const res = await runKraTask(
        () => submitKraProductRegistration({ productCodes: [...selected] }),
        { message: "Please wait while selected products are registered on the KRA device…" },
      );
      setKraUploadMessage(
        res.message ??
          `Uploaded ${res.registered_count ?? selected.size} item(s) to KRA device.`,
      );
    } catch (e) {
      setKraUploadError(e instanceof ApiError ? e.message : "KRA upload failed");
    } finally {
      setKraUploadBusy(false);
    }
  }

  async function handleKraUploadAll() {
    setKraUploadBusy(true);
    setKraUploadMessage(null);
    setKraUploadError(null);
    try {
      const res = await runKraTask(
        () => submitKraProductRegistration({ all: true }),
        { message: "Please wait while the catalogue is registered on the KRA device…" },
      );
      setKraUploadMessage(
        res.message ??
          `Uploaded ${res.registered_count ?? 0} item(s) to KRA device.`,
      );
    } catch (e) {
      setKraUploadError(e instanceof ApiError ? e.message : "KRA upload failed");
    } finally {
      setKraUploadBusy(false);
    }
  }

  return (
    <div className="theme-workspace min-h-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="theme-heading text-2xl font-semibold">Products</h1>
          <p className="theme-subtext mt-1 text-sm">
            Manage catalogue items, pricing and stock levels
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProductImportExport
            totalCount={totalProducts}
            exportSearchParams={buildExportSearchParams}
            onImported={reloadAll}
          />
          <PermissionGate permission={P.catalogue.products.create}>
            <PrimaryLink href="/products/new" permission={P.catalogue.products.create}>
              Add product
            </PrimaryLink>
          </PermissionGate>
        </div>
      </div>

      {kraDeviceEnabled ? (
        <div className="mt-6">
          <KraProductUploadToolbar
            enabled={kraDeviceEnabled}
            filteredCount={totalProducts}
            busy={kraUploadBusy}
            message={kraUploadMessage}
            error={kraUploadError}
            onUploadAll={handleKraUploadAll}
          />
        </div>
      ) : null}

      {/* Stats */}
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${kraDeviceEnabled ? "mt-4" : "mt-6"}`}>
        <StatCard label="Total products" value={stats.total} hint="across all categories" />
        <StatCard
          label="Active"
          value={stats.active}
          hint={`${stats.activePct}% of catalogue`}
        />
        <StatCard label="Low stock" value={stats.lowStock} hint="below reorder point" />
        <StatCard label="Out of stock" value={stats.outOfStock} hint="zero units on hand" />
      </div>
      {multiBranch ? (
        <p className="theme-subtext mt-2 text-xs">
          Shop, store, and stock filters use{" "}
          {user?.branch_id
            ? "your branch"
            : branches.find((b) => String(b.id) === stockBranchId)?.branch_name ?? "the selected branch"}
          {" "}ledger balances.
        </p>
      ) : null}

      {/* Filters */}
      <FilterToolbar className="mt-6 mb-0">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or code…"
        />
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
          {multiBranch && !user?.branch_id ? (
            <FilterSelect
              value={stockBranchId}
              onChange={(e) => setStockBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: String(b.id),
                label: b.branch_name,
              }))}
            />
          ) : null}
          <FilterSelect
            value={pricingFilter}
            onChange={(e) => setPricingFilter(e.target.value)}
            options={[
              { value: "all", label: "All pricing" },
              { value: "retail", label: "Sells W/R" },
              { value: "wholesale", label: "Wholesale" },
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
      </FilterToolbar>

      {referenceWarning ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {referenceWarning} Filters and labels may be incomplete until reference data loads.
        </p>
      ) : null}

      {loading && <p className="theme-subtext mt-8 text-sm">Loading products…</p>}
      {error && (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className={`mt-6 ${TABLE_SHELL_CLASS}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  {selectionEnabled ? (
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="rounded border-slate-300"
                        aria-label="Select all on this page"
                      />
                    </th>
                  ) : null}
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
                    <td colSpan={tableColCount} className="theme-subtext px-4 py-12 text-center">
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
                      selectionEnabled={selectionEnabled}
                      selected={selected}
                      onToggle={toggleOne}
                      isCollapsed={isCollapsed}
                      onToggleSection={toggleSection}
                      visibleColumns={visibleColumns}
                      tableColCount={tableColCount}
                      onView={(code) => router.push(`/products/${encodeURIComponent(code)}`)}
                      onEdit={(product) =>
                        router.push(`/products/${encodeURIComponent(product.product_code)}/edit`)
                      }
                      onDelete={openDeleteDialog}
                      onPriceSaved={reloadAll}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={totalProducts}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
          {listLoading ? (
            <p className="theme-subtext border-t border-[var(--theme-border)] px-4 pb-3 text-center text-xs">
              Updating catalogue…
            </p>
          ) : null}
        </div>
      )}

      <DeleteProductDialog
        open={deleteOpen}
        product={deletingProduct}
        saving={deleteSaving}
        error={deleteError}
        onClose={() => {
          if (!deleteSaving) {
            setDeleteOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={confirmDelete}
      />
      {kraOverlay}
    </div>
  );
}

function CategoryGroup({
  categoryName,
  subMap,
  showCategoryHeader,
  selectionEnabled,
  selected,
  onToggle,
  isCollapsed,
  onToggleSection,
  visibleColumns,
  tableColCount,
  onView,
  onEdit,
  onDelete,
  onPriceSaved,
}) {
  const categoryKey = `category:${categoryName}`;
  const categoryCollapsed = isCollapsed(categoryKey);
  const productCount = [...subMap.values()].reduce((n, items) => n + items.length, 0);

  return (
    <>
      {showCategoryHeader && (
        <tr className={TABLE_SECTION_ROW_CLASS}>
          <td colSpan={tableColCount} className="px-4 py-2.5">
            <button
              type="button"
              onClick={() => onToggleSection(categoryKey)}
              className="theme-subtext flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide"
            >
              <ChevronToggle expanded={!categoryCollapsed} />
              {categoryName}
              <span className="font-normal normal-case opacity-80">
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
            selectionEnabled={selectionEnabled}
            selected={selected}
            onToggle={onToggle}
            isCollapsed={isCollapsed}
            onToggleSection={onToggleSection}
            showCategoryHeader={showCategoryHeader}
            visibleColumns={visibleColumns}
            tableColCount={tableColCount}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onPriceSaved={onPriceSaved}
          />
        ))}
    </>
  );
}

function SubCategoryGroup({
  categoryName,
  subName,
  items,
  selectionEnabled,
  selected,
  onToggle,
  isCollapsed,
  onToggleSection,
  showCategoryHeader,
  visibleColumns,
  tableColCount,
  onView,
  onEdit,
  onDelete,
  onPriceSaved,
}) {
  const subKey = `subcategory:${categoryName}/${subName}`;
  const subCollapsed = isCollapsed(subKey);

  return (
    <>
      <tr className={TABLE_SUBSECTION_ROW_CLASS}>
        <td colSpan={tableColCount} className="px-4 py-2">
          <button
            type="button"
            onClick={() => onToggleSection(subKey)}
            className={`theme-subtext flex w-full items-center gap-2 text-left text-xs font-medium ${showCategoryHeader ? "pl-4" : ""}`}
          >
            <ChevronToggle expanded={!subCollapsed} />
            {subName}
            <span className="font-normal opacity-80">({items.length})</span>
          </button>
        </td>
      </tr>
      {!subCollapsed &&
        items.map((p) => (
          <ProductRow
            key={p.product_code}
            product={p}
            selectionEnabled={selectionEnabled}
            checked={selected.has(p.product_code)}
            onToggle={() => onToggle(p.product_code)}
            visibleColumns={visibleColumns}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onPriceSaved={onPriceSaved}
          />
        ))}
    </>
  );
}

function ProductRow({
  product,
  selectionEnabled,
  checked,
  onToggle,
  visibleColumns,
  onView,
  onEdit,
  onDelete,
  onPriceSaved,
}) {
  return (
    <tr className={TABLE_BODY_ROW_CLASS}>
      {selectionEnabled ? (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="rounded border-slate-300"
            aria-label={`Select ${product.product_name}`}
          />
        </td>
      ) : null}
      {visibleColumns.map((col) => (
        <td key={col.id} className={`px-3 py-3 ${alignClass(col.align)}`}>
          {col.id === "actions" ? (
            <div className="flex items-center justify-center gap-1">
              <ActionButton
                label="View product"
                className="theme-subtext hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
                onClick={() => onView?.(product.product_code)}
              >
                <EyeIcon />
              </ActionButton>
              <ActionButton
                label="Edit product"
                className="theme-subtext hover:bg-[var(--theme-hover)] hover:text-[var(--theme-text)]"
                onClick={() => onEdit?.(product)}
              >
                <PencilIcon />
              </ActionButton>
              <ActionButton
                label="Delete product"
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => onDelete?.(product)}
              >
                <TrashIcon />
              </ActionButton>
            </div>
          ) : (
            renderProductCell(product, col.id, onPriceSaved)
          )}
        </td>
      ))}
    </tr>
  );
}

function renderProductCell(product, columnId, onPriceSaved) {
  switch (columnId) {
    case "product":
      return (
        <>
          <Link
            href={`/products/${encodeURIComponent(product.product_code)}`}
            className="theme-link font-medium"
          >
            {product.product_name}
          </Link>
          <p className="theme-subtext mt-0.5 font-mono text-xs">{product.product_code}</p>
          {product.catalog_scope === "branch" || product.branch_id ? (
            <p className="mt-1 text-xs font-medium text-amber-700">{productScopeLabel(product)}</p>
          ) : null}
        </>
      );
    case "unit_price":
      return (
        <InlineUnitPriceCell
          productCode={product.product_code}
          unitPrice={product.unit_price}
          onSaved={onPriceSaved}
        />
      );
    case "cost_price":
      return <span className="theme-text-muted">{formatKes(product.last_cost_price)}</span>;
    case "discount":
      return <span className="theme-text-muted">{formatDiscount(product)}</span>;
    case "weight":
      return (
        <span className="theme-text-muted">
          {product.display_weight != null ? `${formatQty(product.display_weight)} kg` : "—"}
        </span>
      );
    case "shop":
      return (
        <StockCell
          qty={product.shop_qty}
          uom={product.product_uom}
          unit={product.uom_label}
          factor={product.uom_factor}
          status={product.shop_stock_status}
        />
      );
    case "store":
      return (
        <StockCell
          qty={product.store_qty}
          uom={product.product_uom}
          unit={product.uom_label}
          factor={product.uom_factor}
          status={product.store_stock_status}
        />
      );
    case "reorder":
      return product.effective_reorder_point != null ? (
        <>
          {formatQty(baseToDisplayQty(product.effective_reorder_point, product.uom_factor))}{" "}
          <span className="theme-subtext text-xs">{product.uom_label}</span>
          {product.uses_global_reorder ? (
            <span className="theme-subtext mt-0.5 block text-xs">Global default</span>
          ) : null}
        </>
      ) : (
        "—"
      );
    case "supplier":
      return <span className="theme-text-muted">{product.supplier_name}</span>;
    case "vat":
      return <VatBadge treatment={product.vat_treatment} />;
    case "pricing":
      return <PricingBadge type={product.pricing} />;
    case "alert":
      return product.uses_global_reorder ? (
        <span className="inline-flex rounded-full bg-[var(--theme-surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--theme-text-muted)] ring-1 ring-[var(--theme-border)]">
          Global
        </span>
      ) : (
        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
          Custom
        </span>
      );
    case "updated":
      return <UserDateCell name={product.audit_name} date={product.audit_date} />;
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
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3 py-2.5`}
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
          <div className="theme-panel absolute right-0 z-20 mt-2 w-56 rounded-xl border p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <p className="theme-subtext text-xs font-semibold uppercase tracking-wide">
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
                        col.required
                          ? "theme-subtext cursor-not-allowed opacity-60"
                          : "cursor-pointer text-[var(--theme-text-muted)] hover:bg-[var(--theme-hover)]"
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

function VatBadge({ treatment }) {
  if (treatment === "—") return <span className="theme-subtext">—</span>;
  const vatable = treatment === "Vatable";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
        vatable
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)] ring-[var(--theme-border)]"
      }`}
    >
      {treatment}
    </span>
  );
}

function InlineUnitPriceCell({ productCode, unitPrice, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(unitPrice ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!editing) setValue(String(unitPrice ?? ""));
  }, [unitPrice, editing]);

  async function save() {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) {
      setError("Enter a valid price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/products/${encodeURIComponent(productCode)}`, {
        method: "PUT",
        body: { unit_price: next },
      });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="theme-text-muted rounded px-1 hover:bg-[var(--theme-hover)] hover:text-[var(--theme-link)]"
        title="Click to update price"
      >
        {formatKes(unitPrice)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${inputClassName()} w-28 text-right`}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="theme-secondary-btn rounded px-2 py-0.5 text-xs"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="text-[10px] text-red-600">{error}</p> : null}
    </div>
  );
}

function StockCell({ qty, uom, unit, factor, status }) {
  const stockText = formatMixedStockDisplay(qty, uom ?? factor ?? 1, unit).text;
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
      <p className={`text-sm font-semibold leading-tight ${s.number}`}>{stockText}</p>
      <p className={`text-xs ${s.text}`}>{s.label}</p>
    </div>
  );
}

function ActionButton({ label, className, children, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition ${className}`}
    >
      {children}
    </button>
  );
}

function ChevronToggle({ expanded }) {
  return (
    <span className="theme-subtext inline-flex h-5 w-5 shrink-0 items-center justify-center rounded">
      {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
    </span>
  );
}

function PricingBadge({ type }) {
  const styles = {
    "Sells W/R": "bg-violet-50 text-violet-700 ring-violet-600/20",
    Wholesale: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${styles[type] ?? "bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)] ring-[var(--theme-border)]"}`}
      title={type === "Sells W/R" ? "Sells wholesale and retail" : "Wholesale only"}
    >
      {type}
    </span>
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="theme-subtext">
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

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
