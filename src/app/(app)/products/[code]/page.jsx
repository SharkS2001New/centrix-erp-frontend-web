"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  formatShortDate,
  PencilIcon,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { DeleteProductDialog } from "@/components/products/delete-product-dialog";
import { formatUomOption } from "@/components/products/product-form";
import { formatPoNumber } from "@/components/lpo/lpo-shared";
import { baseToDisplayQty } from "@/lib/stock-uom";

const MAIN_TABS = [
  { id: "info", label: "Product information" },
  { id: "activity", label: "Stock, sales & purchases" },
];

const TAB_BTN =
  "rounded-md px-3 py-1 text-xs font-medium transition";
const TAB_BTN_ACTIVE = "bg-white text-[#185FA5] shadow-sm";
const TAB_BTN_IDLE = "text-slate-600 hover:text-slate-900";

const ACTIVITY_VIEWS = [
  {
    id: "stock",
    label: "Inventory ledger",
    description:
      "Every stock change for this product — receipts, sales, transfers, adjustments, and returns.",
    countLabel: (n) => `${n} movement${n === 1 ? "" : "s"}`,
    emptyMessage: "No stock movements recorded yet.",
    loadingMessage: "Loading movements…",
  },
  {
    id: "purchases",
    label: "Purchases",
    description:
      "Purchase orders (LPO) that include this item, plus stock received into shop or store.",
    countLabel: (n) => `${n} purchase${n === 1 ? "" : "s"}`,
    emptyMessage: "No purchases made against this item yet.",
    loadingMessage: "Loading purchases…",
  },
  {
    id: "sales",
    label: "Sales",
    description:
      "Orders where this product was sold, with the seller, order number, date, and quantity.",
    countLabel: (n) => `${n} record${n === 1 ? "" : "s"}`,
    emptyMessage: "No sales recorded for this product yet.",
    loadingMessage: "Loading sales…",
  },
];

const LEGACY_ACTIVITY_TABS = new Set(["stock", "purchases", "sales", "overview"]);

function parsePageTabs(searchParams) {
  const tab = searchParams.get("tab");
  const view = searchParams.get("view");

  if (!tab || tab === "info") {
    return { mainTab: "info", activityView: "stock" };
  }
  if (tab === "activity") {
    const activityView = ACTIVITY_VIEWS.some((v) => v.id === view) ? view : "stock";
    return { mainTab: "activity", activityView };
  }
  if (LEGACY_ACTIVITY_TABS.has(tab)) {
    return {
      mainTab: "activity",
      activityView: tab === "overview" ? "stock" : tab,
    };
  }
  return { mainTab: "info", activityView: "stock" };
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

function enrichProduct(product, subById, catById, supplierById, uomById, vatById, retailPackage) {
  const sub = subById.get(product.subcategory_id);
  const cat = sub ? catById.get(sub.category_id) : null;
  const supplier = supplierById.get(product.supplier_id);
  const uom = uomById.get(product.unit_id);
  const vat = vatById.get(product.vat_id);
  const shop = Number(product.stock_in_shop ?? 0);
  const store = Number(product.stock_in_store ?? 0);
  const factor = Number(uom?.conversion_factor ?? 1);
  const sellOnRetail = product.sell_on_retail === 1 || product.sell_on_retail === true;

  return {
    ...product,
    category_id: cat?.id,
    category_name: cat?.category_name ?? "Uncategorised",
    subcategory_name: sub?.subcategory_name ?? "General",
    supplier_name: supplier?.supplier_name ?? "—",
    uom_label: uom?.full_name ?? uom?.uom_type ?? "—",
    uom_factor: factor,
    uom_display: uom ? formatUomOption(uom) : "—",
    vat_label: vat
      ? `${vat.vat_name ?? vat.vat_code} (${vat.vat_percentage}%)`
      : "—",
    discount_label: formatDiscount(product),
    is_active: !product.deleted_at,
    sell_on_retail_label: sellOnRetail ? "Yes" : "No",
    total_stock: shop + store,
    stock_in_shop_display: baseToDisplayQty(shop, factor),
    stock_in_store_display: baseToDisplayQty(store, factor),
    total_stock_display: baseToDisplayQty(shop + store, factor),
    retail_package: retailPackage,
  };
}

function movementLabel(row, factor = 1) {
  const type = String(row.transaction_type ?? "").toUpperCase();
  const qty = Number(row.quantity_change ?? 0);
  const abs = baseToDisplayQty(Math.abs(qty), factor);
  const fmt = (n) => formatQty(n);
  if (type === "PURCHASE") {
    return `+${fmt(abs)} Purchase / receipt`;
  }
  if (type === "POS_SALE" || type === "MOBILE_SALE" || type === "BACKEND_SALE") {
    return `−${fmt(abs)} Sale`;
  }
  if (type === "SUPPLIER_RETURN") {
    return `−${fmt(abs)} Supplier return`;
  }
  if (type === "RETURN") {
    return `+${fmt(abs)} Customer return`;
  }
  if (type === "TRANSFER") {
    return `${qty > 0 ? "+" : "−"}${fmt(abs)} Transfer`;
  }
  if (type === "ADJUSTMENT" || type === "STOCK_TAKE") {
    return `${qty > 0 ? "+" : "−"}${fmt(abs)} ${type === "STOCK_TAKE" ? "Stock take" : "Adjustment"}`;
  }
  if (type === "DAMAGE" || type === "WRITE_OFF") {
    return `−${fmt(abs)} ${type === "DAMAGE" ? "Damage" : "Write-off"}`;
  }
  return `${qty > 0 ? "+" : qty < 0 ? "−" : ""}${fmt(abs)} ${type || "Movement"}`;
}

function buildPurchaseRows(lpoLines, receiptTxns, factor = 1) {
  const rows = [];

  for (const line of lpoLines) {
    const received = Number(line.received_qty ?? 0);
    rows.push({
      id: `lpo-${line.id}`,
      kind: "lpo",
      sortKey: Number(line.lpo_no ?? 0),
      date: "Purchase order",
      label: `Ordered ${formatQty(line.ordered_qty)} on ${formatPoNumber(line.lpo_no)}`,
      subtitle: `Received ${formatQty(received)} · ${formatKes(line.cost_price)} per unit`,
      tone: received > 0 ? "in" : "neutral",
      href: `/lpo/${line.lpo_no}`,
    });
  }

  for (const txn of receiptTxns) {
    const qty = baseToDisplayQty(Math.abs(Number(txn.quantity_change ?? 0)), factor);
    rows.push({
      id: `receipt-${txn.id}`,
      kind: "receipt",
      sortKey: txn.created_at ? new Date(txn.created_at).getTime() : 0,
      date: txn.created_at
        ? formatShortDate(String(txn.created_at).slice(0, 10))
        : "—",
      label: `+${formatQty(qty)} received into ${txn.stock_location ?? "store"}`,
      subtitle:
        txn.unit_cost != null && txn.unit_cost !== ""
          ? `Unit cost ${formatKes(txn.unit_cost)}`
          : undefined,
      tone: "in",
    });
  }

  return rows.sort((a, b) => {
    if (a.kind === "receipt" && b.kind === "receipt") {
      return b.sortKey - a.sortKey;
    }
    if (a.kind === "receipt") return -1;
    if (b.kind === "receipt") return 1;
    return b.sortKey - a.sortKey;
  });
}

function sellerDisplayName(cashier) {
  if (!cashier) return "Unknown seller";
  return cashier.full_name?.trim() || cashier.username || "Unknown seller";
}

function buildSaleRows(items, productCode) {
  const from = encodeURIComponent(`/products/${productCode}?tab=activity&view=sales`);

  return items.map((row) => {
    const sale = row.sale ?? {};
    const cashier = sale.cashier;
    const seller = sellerDisplayName(cashier);
    const orderNum = sale.order_num ?? row.sale_id;
    const saleDate = sale.completed_at ?? sale.created_at ?? row.created_at;
    const dateLabel = saleDate
      ? formatShortDate(String(saleDate).slice(0, 10))
      : "—";

    return {
      id: row.id,
      label: `Order #${orderNum}`,
      subtitle: `Sold by ${seller}`,
      href: `/sales/orders/${row.sale_id}?from=${from}`,
      date: dateLabel,
      quantity: `${formatQty(row.quantity)} units`,
    };
  });
}

function stockStatus(total, reorderPoint, globalThreshold) {
  const qty = Number(total ?? 0);
  if (qty <= 0) return { label: "Out of stock", tone: "red" };
  const threshold =
    Number(reorderPoint ?? 0) > 0 ? Number(reorderPoint) : Number(globalThreshold ?? 0);
  if (threshold > 0 && qty <= threshold) return { label: "Low stock", tone: "amber" };
  return { label: "In stock", tone: "green" };
}

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          : "bg-slate-100 text-slate-600 ring-slate-300/50"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function StockBadge({ tone, label }) {
  const styles = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${styles[tone] ?? styles.green}`}
    >
      {label}
    </span>
  );
}

function MetricCard({ label, value, hint, accent = "slate" }) {
  const accents = {
    slate: "border-slate-200",
    blue: "border-[#B5D4F4] bg-gradient-to-br from-[#E6F1FB]/80 to-white",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white",
    violet: "border-violet-200 bg-gradient-to-br from-violet-50/60 to-white",
  };
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${accents[accent] ?? accents.slate} bg-white`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function DetailItem({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function movementTone(row) {
  const qty = Number(row.quantity_change ?? 0);
  if (qty > 0) return "in";
  if (qty < 0) return "out";
  return "neutral";
}

function ActivityRow({ date, label, subtitle, tone, href }) {
  const styles = {
    in: "bg-emerald-100 text-emerald-700",
    out: "bg-red-100 text-red-700",
    neutral: "bg-slate-100 text-slate-600",
  };
  const symbols = { in: "+", out: "−", neutral: "·" };
  const labelNode = href ? (
    <Link href={href} className="text-sm font-medium text-[#185FA5] hover:underline">
      {label}
    </Link>
  ) : (
    <p className="text-sm font-medium text-slate-800">{label}</p>
  );
  return (
    <li className="flex items-center gap-3 py-3.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${styles[tone]}`}
      >
        {symbols[tone]}
      </span>
      <div className="min-w-0 flex-1">
        {labelNode}
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        <p className="text-xs text-slate-500">{date}</p>
      </div>
    </li>
  );
}

function SaleActivityRow({ date, label, subtitle, href, quantity }) {
  const labelNode = href ? (
    <Link href={href} className="text-sm font-medium text-[#185FA5] hover:underline">
      {label}
    </Link>
  ) : (
    <span className="text-sm font-medium text-slate-800">{label}</span>
  );

  return (
    <li className="flex items-center gap-3 py-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-700">
        −
      </span>
      <div className="relative flex min-w-0 flex-1 items-center gap-4">
        <div className="min-w-0 shrink-0">{labelNode}</div>
        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          <div className="px-2 text-center">
            <p className="text-sm text-slate-700">{subtitle ?? "—"}</p>
            <p className="mt-0.5 text-xs text-slate-500">{date}</p>
          </div>
        </div>
        <div className="ml-auto min-w-0 shrink-0 text-right text-xs text-slate-500">
          {quantity}
        </div>
      </div>
    </li>
  );
}

function ActivityViewIntro({ title, description }) {
  return (
    <div className="border-b border-slate-100 px-5 py-3">
      <h3 className="text-sm font-medium text-slate-800">{title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

function EmptyTabState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="mt-3 text-sm text-slate-500">{message}</p>
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productCode = decodeURIComponent(params.code);

  const initialTabs = parsePageTabs(searchParams);
  const [mainTab, setMainTab] = useState(initialTabs.mainTab);
  const [activityView, setActivityView] = useState(initialTabs.activityView);

  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [vats, setVats] = useState([]);
  const [retailPackage, setRetailPackage] = useState(null);
  const [globalReorderLevel, setGlobalReorderLevel] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [purchaseRows, setPurchaseRows] = useState([]);
  const [saleRows, setSaleRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const subById = useMemo(() => new Map(subCategories.map((s) => [s.id, s])), [subCategories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);

  const enriched = useMemo(
    () =>
      product
        ? enrichProduct(product, subById, catById, supplierById, uomById, vatById, retailPackage)
        : null,
    [product, subById, catById, supplierById, uomById, vatById, retailPackage],
  );

  const profitMargin = useMemo(() => {
    if (!enriched) return null;
    const sell = Number(enriched.unit_price ?? 0);
    const cost = Number(enriched.last_cost_price ?? 0);
    if (sell <= 0) return null;
    return Math.round(((sell - cost) / sell) * 100);
  }, [enriched]);

  const stockValue = useMemo(() => {
    if (!enriched) return null;
    const qty = Number(enriched.total_stock ?? 0);
    const cost = Number(enriched.last_cost_price ?? 0);
    const sell = Number(enriched.unit_price ?? 0);
    return {
      atCost: qty * cost,
      atSelling: qty * sell,
    };
  }, [enriched]);

  const reorderLabel = useMemo(() => {
    if (!enriched) return "—";
    const rp = Number(enriched.reorder_point ?? 0);
    if (rp > 0) {
      return `${formatQty(baseToDisplayQty(rp, enriched.uom_factor))} ${enriched.uom_label}`;
    }
    if (globalReorderLevel != null) {
      return `${formatQty(baseToDisplayQty(globalReorderLevel, enriched.uom_factor))} ${enriched.uom_label} (organisation default)`;
    }
    return "Organisation default";
  }, [enriched, globalReorderLevel]);

  const loadMeta = useCallback(async () => {
    const [catRes, subRes, supRes, uomRes, vatRes, retailRes, settingsRes] = await Promise.all([
      apiRequest("/categories", { searchParams: { per_page: 200 } }),
      apiRequest("/sub-categories", { searchParams: { per_page: 200 } }),
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/uoms", { searchParams: { per_page: 100 } }),
      apiRequest("/vats", { searchParams: { per_page: 50 } }),
      apiRequest("/retail-package-settings", {
        searchParams: { per_page: 1, "filter[product_code]": productCode },
      }).catch(() => ({ data: [] })),
      apiRequest("/system-settings", { searchParams: { per_page: 1 } }).catch(() => null),
    ]);
    setCategories(catRes.data ?? []);
    setSubCategories(subRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setUoms(uomRes.data ?? uomRes ?? []);
    setVats(vatRes.data ?? vatRes ?? []);
    const retailRows = retailRes?.data ?? [];
    setRetailPackage(retailRows[0] ?? null);
    const settingsRows = settingsRes?.data ?? settingsRes ?? [];
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
    const threshold = settings?.global_low_stock_threshold;
    setGlobalReorderLevel(
      threshold != null && threshold !== "" ? Number(threshold) : null,
    );
  }, [productCode]);

  const loadProduct = useCallback(async () => {
    const res = await apiRequest(`/products/${encodeURIComponent(productCode)}`);
    setProduct(res.data ?? res);
  }, [productCode]);

  const loadTabData = useCallback(async () => {
    if (mainTab !== "activity") return;

    setTabLoading(true);
    try {
      if (activityView === "stock") {
        const res = await apiRequest("/inventory-transactions", {
          searchParams: {
            per_page: 50,
            "filter[product_code]": productCode,
          },
        });
        setStockRows(res.data ?? []);
      } else if (activityView === "purchases") {
        const [lpoRes, txnRes] = await Promise.all([
          apiRequest("/lpo-txn", {
            searchParams: {
              per_page: 50,
              "filter[product_code]": productCode,
            },
          }),
          apiRequest("/inventory-transactions", {
            searchParams: {
              per_page: 50,
              "filter[product_code]": productCode,
              "filter[transaction_type]": "PURCHASE",
            },
          }),
        ]);
        const lpoLines = lpoRes.data ?? [];
        const receiptTxns = txnRes.data ?? [];
        setPurchaseRows(buildPurchaseRows(lpoLines, receiptTxns, enriched?.uom_factor ?? 1));
      } else if (activityView === "sales") {
        const itemsRes = await apiRequest("/sale-items", {
          searchParams: {
            per_page: 50,
            "filter[product_code]": productCode,
          },
        });
        setSaleRows(buildSaleRows(itemsRes.data ?? [], productCode));
      }
    } finally {
      setTabLoading(false);
    }
  }, [mainTab, activityView, productCode]);

  const loadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadMeta(), loadProduct()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadProduct]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!product) return;
    loadTabData();
  }, [product, loadTabData]);

  useEffect(() => {
    const parsed = parsePageTabs(searchParams);
    setMainTab(parsed.mainTab);
    setActivityView(parsed.activityView);
  }, [searchParams]);

  function syncUrl(nextMainTab, nextActivityView = activityView) {
    const params = new URLSearchParams();
    if (nextMainTab === "activity") {
      params.set("tab", "activity");
      params.set("view", nextActivityView);
    }
    const query = params.toString();
    router.replace(
      `/products/${encodeURIComponent(productCode)}${query ? `?${query}` : ""}`,
      { scroll: false },
    );
  }

  function selectMainTab(id) {
    setMainTab(id);
    syncUrl(id, activityView);
  }

  function selectActivityView(id) {
    setMainTab("activity");
    setActivityView(id);
    syncUrl("activity", id);
  }

  async function confirmDelete() {
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await apiRequest(`/products/${encodeURIComponent(productCode)}`, { method: "DELETE" });
      router.push("/products");
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeleteSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 md:-m-8 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-28 rounded-xl bg-white shadow-sm" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-white shadow-sm" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-white shadow-sm" />
        </div>
      </div>
    );
  }

  if (error || !enriched) {
    return (
      <div className="p-8">
        <Link href="/products" className="text-sm text-[#185FA5] hover:underline">
          ← Back to products
        </Link>
        <p className="mt-4 text-sm text-red-600">{error ?? "Product not found"}</p>
      </div>
    );
  }

  const retail = enriched.retail_package;
  const stock = stockStatus(
    enriched.total_stock,
    enriched.reorder_point,
    globalReorderLevel,
  );
  const activeActivity =
    ACTIVITY_VIEWS.find((v) => v.id === activityView) ?? ACTIVITY_VIEWS[0];
  const activityCount =
    activityView === "sales"
      ? saleRows.length
      : activityView === "purchases"
        ? purchaseRows.length
        : stockRows.length;

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6">
        <Link href="/products" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to products
        </Link>
      </div>

      {/* Hero */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#E6F1FB] via-white to-white px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge active={enriched.is_active} />
                <StockBadge tone={stock.tone} label={stock.label} />
                {enriched.sell_on_retail_label === "Yes" ? (
                  <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-600/20">
                    Retail
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                {enriched.product_name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                <span className="font-mono text-slate-800">{enriched.product_code}</span>
                <span className="text-slate-300">·</span>
                <span>{enriched.category_name}</span>
                <span className="text-slate-300">/</span>
                <span>{enriched.subcategory_name}</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/products/${encodeURIComponent(productCode)}/edit`}
                className="inline-flex items-center gap-2 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#144f8a]"
              >
                <PencilIcon />
                Edit
              </Link>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main tabs */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5">
            {MAIN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectMainTab(t.id)}
                className={`${TAB_BTN} ${
                  mainTab === t.id ? TAB_BTN_ACTIVE : TAB_BTN_IDLE
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {mainTab === "info" ? (
          <div className="space-y-6 p-5 md:p-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total stock"
                value={`${formatQty(enriched.total_stock_display)} ${enriched.uom_label}`}
                hint={`Shop ${formatQty(enriched.stock_in_shop_display)} · Store ${formatQty(enriched.stock_in_store_display)}`}
                accent="blue"
              />
              <MetricCard
                label="Stock value (cost)"
                value={stockValue ? formatKes(stockValue.atCost) : "—"}
                hint={
                  enriched.total_stock > 0
                    ? `${formatQty(enriched.total_stock)} × ${formatKes(enriched.last_cost_price)}`
                    : undefined
                }
                accent="green"
              />
              <MetricCard
                label="Selling price"
                value={formatKes(enriched.unit_price)}
                hint={
                  profitMargin != null ? `${profitMargin}% profit margin` : "Per unit wholesale price"
                }
                accent="violet"
              />
              <MetricCard
                label="Stock value (selling)"
                value={stockValue ? formatKes(stockValue.atSelling) : "—"}
                hint={
                  enriched.total_stock > 0
                    ? `${formatQty(enriched.total_stock)} × ${formatKes(enriched.unit_price)}`
                    : undefined
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Classification" description="Catalogue and supplier details">
                <DetailItem label="SKU">
                  <span className="font-mono">{enriched.product_code}</span>
                </DetailItem>
                <DetailItem label="Category">{enriched.category_name}</DetailItem>
                <DetailItem label="Sub-category">{enriched.subcategory_name}</DetailItem>
                <DetailItem label="Unit of measure">{enriched.uom_display}</DetailItem>
                <DetailItem label="Supplier">{enriched.supplier_name}</DetailItem>
                <DetailItem label="Product weight">
                  {enriched.product_weight != null && enriched.product_weight !== ""
                    ? `${formatQty(enriched.product_weight)} kg`
                    : "—"}
                </DetailItem>
              </SectionCard>

              <SectionCard title="Pricing & tax" description="Unit economics and VAT">
                <DetailItem label="Cost price">{formatKes(enriched.last_cost_price)}</DetailItem>
                <DetailItem label="Selling price">{formatKes(enriched.unit_price)}</DetailItem>
                <DetailItem label="Last selling price">{formatKes(enriched.last_selling_price)}</DetailItem>
                <DetailItem label="Discount">{enriched.discount_label}</DetailItem>
                <DetailItem label="VAT status">{enriched.vat_label}</DetailItem>
                <DetailItem label="Profit margin">
                  {profitMargin != null ? `${profitMargin}%` : "—"}
                </DetailItem>
              </SectionCard>

              <SectionCard title="Inventory" description="Stock levels and alerts">
                <DetailItem label="Stock in shop">
                  {formatQty(enriched.stock_in_shop_display)} {enriched.uom_label}
                </DetailItem>
                <DetailItem label="Stock in store">
                  {formatQty(enriched.stock_in_store_display)} {enriched.uom_label}
                </DetailItem>
                <DetailItem label="Reorder level">{reorderLabel}</DetailItem>
                <DetailItem label="Sell on retail">{enriched.sell_on_retail_label}</DetailItem>
              </SectionCard>

              <SectionCard title="Record" description="Audit trail">
                <DetailItem label="Created">{formatDateTime(enriched.created_at)}</DetailItem>
                <DetailItem label="Last updated">{formatDateTime(enriched.updated_at)}</DetailItem>
                <DetailItem label="Status">
                  <StatusBadge active={enriched.is_active} />
                </DetailItem>
              </SectionCard>
            </div>

            {retail ? (
              <section className="rounded-xl border border-[#B5D4F4] bg-gradient-to-br from-[#E6F1FB]/40 to-white shadow-sm">
                <div className="border-b border-[#B5D4F4]/60 px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-[#0C447C]">Retail package settings</h2>
                  <p className="mt-0.5 text-xs text-[#0C447C]/70">
                    Pack sizes and markups for retail checkout
                  </p>
                </div>
                <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  <DetailItem label="Pack qty">
                    {retail.max_qty_measure != null ? formatQty(retail.max_qty_measure) : "—"}
                    {retail.max_uom_measure ? ` ${retail.max_uom_measure}` : ""}
                  </DetailItem>
                  <DetailItem label="Retail markup">{formatKes(retail.markup_price)}</DetailItem>
                  <DetailItem label="Wholesale pack qty">
                    {retail.wholesale_qty_measure != null
                      ? formatQty(retail.wholesale_qty_measure)
                      : "—"}
                    {retail.min_uom_measure ? ` ${retail.min_uom_measure}` : ""}
                  </DetailItem>
                  <DetailItem label="Wholesale markup">
                    {formatKes(retail.wholesale_markup_price)}
                  </DetailItem>
                </dl>
              </section>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
              <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-0.5">
                {ACTIVITY_VIEWS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectActivityView(t.id)}
                    className={`${TAB_BTN} ${
                      activityView === t.id ? TAB_BTN_ACTIVE : TAB_BTN_IDLE
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {activeActivity.countLabel(activityCount)}
              </p>
            </div>

            <ActivityViewIntro
              title={activeActivity.label}
              description={activeActivity.description}
            />

            <div className="px-5 py-2">
              {activityView === "stock" ? (
                tabLoading ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {activeActivity.loadingMessage}
                  </p>
                ) : stockRows.length === 0 ? (
                  <EmptyTabState message={activeActivity.emptyMessage} />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {stockRows.map((row) => (
                      <ActivityRow
                        key={row.id}
                        date={
                          row.created_at
                            ? formatShortDate(String(row.created_at).slice(0, 10))
                            : "—"
                        }
                        label={movementLabel(row, enriched.uom_factor)}
                        tone={movementTone(row)}
                      />
                    ))}
                  </ul>
                )
              ) : null}

              {activityView === "purchases" ? (
                tabLoading ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {activeActivity.loadingMessage}
                  </p>
                ) : purchaseRows.length === 0 ? (
                  <EmptyTabState message={activeActivity.emptyMessage} />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {purchaseRows.map((row) => (
                      <ActivityRow
                        key={row.id}
                        date={row.date}
                        label={row.label}
                        subtitle={row.subtitle}
                        tone={row.tone}
                        href={row.href}
                      />
                    ))}
                  </ul>
                )
              ) : null}

              {activityView === "sales" ? (
                tabLoading ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {activeActivity.loadingMessage}
                  </p>
                ) : saleRows.length === 0 ? (
                  <EmptyTabState message={activeActivity.emptyMessage} />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {saleRows.map((row) => (
                      <SaleActivityRow
                        key={row.id}
                        date={row.date}
                        label={row.label}
                        subtitle={row.subtitle}
                        href={row.href}
                        quantity={row.quantity}
                      />
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          </>
        )}
      </div>

      <DeleteProductDialog
        open={deleteOpen}
        product={enriched}
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
    </div>
  );
}
