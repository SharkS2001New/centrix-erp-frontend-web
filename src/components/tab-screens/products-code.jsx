"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  fetchCategoriesCached,
  fetchRetailPackagesCached,
  fetchSubCategoriesCached,
  fetchSuppliersCached,
  fetchUomsCached,
  fetchUsersCached,
  fetchVatsCached,
} from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { productsCatalogHref } from "@/lib/products-list-state";
import { isProductShelfLocationEnabled } from "@/lib/distribution-settings";
import { ProductStockHistoryPanel } from "@/components/products/product-stock-history-panel";
import {
  formatShortDate,
  PencilIcon,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { DeleteProductDialog } from "@/components/products/delete-product-dialog";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { formatUomOption } from "@/components/products/product-form";
import { formatPoNumber, lpoDisplayNumber, lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";
import {
  coercePricingTiersInput,
  fullPackageLabel,
  measureLevelLabel,
  normalizePricingTiers,
  uomConversionSummary,
  uomHasFullPack,
  uomHierarchyChain,
} from "@/lib/uom-packaging";
import { stockSellingValue } from "@/lib/retail-pricing";
import { baseToDisplayQty, formatMixedStockDisplay } from "@/lib/stock-uom";
import { formatOrderNumber } from "@/lib/sales";
import { resolveProductAudit } from "@/lib/product-audit";
import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";

const MAIN_TABS = [
  { id: "info", label: "Product information" },
  { id: "activity", label: "Stock, sales & purchases" },
];

const TAB_BTN = "rounded-md px-3 py-1 text-xs font-medium transition";
const TAB_BTN_ACTIVE = "theme-tab-active shadow-sm";
const TAB_BTN_IDLE = "theme-tab-inactive";

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

function enrichProduct(product, subById, catById, supplierById, uomById, vatById, retailPackage) {
  const sub = subById.get(product.subcategory_id);
  const cat = sub ? catById.get(sub.category_id) : null;
  const supplier = supplierById.get(product.supplier_id);
  const uom = uomById.get(product.unit_id) ?? uomById.get(String(product.unit_id ?? ""));
  const vat = vatById.get(product.vat_id);
  const shop = Number(
    product.stock_available_shop ??
      product.branch_stock?.shop_available ??
      product.branch_stock?.shop_quantity ??
      product.stock_on_hand_shop ??
      product.stock_in_shop ??
      0,
  );
  const store = Number(
    product.stock_available_store ??
      product.branch_stock?.store_available ??
      product.branch_stock?.store_quantity ??
      product.stock_on_hand_store ??
      product.stock_in_store ??
      0,
  );
  const factor = Number(uom?.conversion_factor ?? 1);
  const sellOnRetail = product.sell_on_retail === 1 || product.sell_on_retail === true;
  const packLabel = fullPackageLabel(uom);

  return {
    ...product,
    category_id: cat?.id,
    category_name: cat?.category_name ?? "Uncategorised",
    subcategory_name: sub?.subcategory_name ?? "General",
    supplier_name: supplier?.supplier_name ?? "—",
    product_uom: uom ?? null,
    uom_label: packLabel,
    uom_factor: factor,
    uom_display: uom ? formatUomOption(uom) : "—",
    uom_hierarchy: uom ? uomHierarchyChain(uom) : "—",
    uom_conversion: uom ? uomConversionSummary(uom) : null,
    vat_label: vat
      ? `${vat.vat_name ?? vat.vat_code} (${vat.vat_percentage}%)`
      : "—",
    discount_label: formatDiscount(product),
    is_active: !product.deleted_at,
    pricing_mode: sellOnRetail ? "Sells W/R" : "Wholesale",
    sell_on_retail_label: sellOnRetail ? "Sells W/R" : "Wholesale only",
    total_stock: shop + store,
    stock_shop_text: formatMixedStockDisplay(shop, uom).text,
    stock_store_text: formatMixedStockDisplay(store, uom).text,
    stock_total_text: formatMixedStockDisplay(shop + store, uom).text,
    retail_package: retailPackage,
  };
}

function formatRetailTiersSummary(retailPackage, uom) {
  if (!retailPackage) return [];
  const parsedTiers = coercePricingTiersInput(retailPackage.pricing_tiers);
  const raw = parsedTiers.length
    ? parsedTiers
    : retailPackage.max_qty_measure
      ? [
          {
            min_qty: 1,
            max_qty: retailPackage.max_qty_measure,
            measure_level: "small",
            price_mode: "retail",
            markup_price: retailPackage.markup_price ?? 0,
          },
        ]
      : [];
  return normalizePricingTiers(raw).map((tier) => {
    const to = tier.max_qty === "" || tier.max_qty == null ? "∞" : tier.max_qty;
    const level = measureLevelLabel(uom, tier.measure_level);
    const mode = tier.price_mode === "wholesale" ? "Wholesale" : "Retail";
    return `${mode} ${tier.min_qty}–${to} ${level} · markup ${formatKes(tier.markup_price)}/unit`;
  });
}

function buildPurchaseRows(lpoLines, receiptTxns, uom) {
  const packLabel = fullPackageLabel(uom);
  const rows = [];

  for (const line of lpoLines) {
    const received = Number(line.received_qty ?? 0);
    rows.push({
      id: `lpo-${line.id}`,
      kind: "lpo",
      sortKey: Number(line.lpo_no ?? 0),
      date: "Purchase order",
      label: `Ordered ${formatQty(line.ordered_qty)} ${packLabel} on ${line.po_number ?? lpoRowDisplayNumber(line)}`,
      subtitle: `Received ${formatQty(received)} ${packLabel} · ${formatKes(line.cost_price)} per ${packLabel}`,
      tone: received > 0 ? "in" : "neutral",
      href: `/lpo/${line.lpo_no}`,
    });
  }

  for (const txn of receiptTxns) {
    const qty = formatMixedStockDisplay(Math.abs(Number(txn.quantity_change ?? 0)), uom).text;
    rows.push({
      id: `receipt-${txn.id}`,
      kind: "receipt",
      sortKey: txn.created_at ? new Date(txn.created_at).getTime() : 0,
      date: txn.created_at
        ? formatShortDate(String(txn.created_at).slice(0, 10))
        : "—",
      label: `+${qty} received into ${txn.stock_location ?? "store"}`,
      subtitle:
        txn.unit_cost != null && txn.unit_cost !== ""
          ? `Cost per ${packLabel} ${formatKes(txn.unit_cost)}`
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

function buildSaleRows(items, productCode, uom) {
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
    const qtyBase = Number(row.quantity ?? 0);

    return {
      id: row.id,
      label: `Order #${formatOrderNumber(orderNum)}`,
      subtitle: `Sold by ${seller}`,
      href: `/sales/orders/${row.sale_id}?from=${from}`,
      date: dateLabel,
      quantity: formatMixedStockDisplay(qtyBase, uom).text,
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
          : "bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)] ring-[var(--theme-border)]"
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

function MetricCard({ label, value, hint, accent = "default" }) {
  const accents = {
    default: "border-[var(--theme-border)] bg-[var(--theme-surface)]",
    primary:
      "border-[var(--theme-border)] bg-gradient-to-br from-[var(--theme-primary-subtle)] to-[var(--theme-surface)]",
    success:
      "border-[color-mix(in_srgb,#22c55e_30%,var(--theme-border))] bg-gradient-to-br from-[color-mix(in_srgb,#22c55e_10%,var(--theme-surface))] to-[var(--theme-surface)]",
    accent:
      "border-[var(--theme-border)] bg-gradient-to-br from-[var(--theme-primary-muted)] to-[var(--theme-surface)]",
  };
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${accents[accent] ?? accents.default}`}
    >
      <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="theme-heading mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="theme-subtext mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <section className="theme-panel rounded-xl border shadow-sm">
      <div className="border-b border-[var(--theme-border)] px-5 py-3.5">
        <h2 className="theme-heading text-sm font-semibold">{title}</h2>
        {description ? <p className="theme-subtext mt-0.5 text-xs">{description}</p> : null}
      </div>
      <dl className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function DetailItem({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className="theme-heading mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

function UserDateCell({ name, date }) {
  return (
    <div>
      <p className="theme-heading font-medium">{name || "—"}</p>
      <p className="theme-subtext mt-0.5 text-xs font-normal">{formatShortDate(date)}</p>
    </div>
  );
}

function ActivityRow({ date, label, subtitle, tone, href }) {
  const styles = {
    in: "bg-emerald-100 text-emerald-700",
    out: "bg-red-100 text-red-700",
    neutral: "bg-[var(--theme-surface-muted)] text-[var(--theme-text-muted)]",
  };
  const symbols = { in: "+", out: "−", neutral: "·" };
  const labelNode = href ? (
    <Link href={href} className="theme-link text-sm font-medium hover:underline">
      {label}
    </Link>
  ) : (
    <p className="theme-heading text-sm font-medium">{label}</p>
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
        {subtitle ? <p className="theme-subtext mt-0.5 text-xs">{subtitle}</p> : null}
        <p className="theme-subtext text-xs">{date}</p>
      </div>
    </li>
  );
}

function SaleActivityRow({ date, label, subtitle, href, quantity }) {
  const labelNode = href ? (
    <Link href={href} className="theme-link text-sm font-medium hover:underline">
      {label}
    </Link>
  ) : (
    <span className="theme-heading text-sm font-medium">{label}</span>
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
            <p className="theme-text-muted text-sm">{subtitle ?? "—"}</p>
            <p className="theme-subtext mt-0.5 text-xs">{date}</p>
          </div>
        </div>
        <div className="theme-subtext ml-auto min-w-0 shrink-0 text-right text-xs">
          {quantity}
        </div>
      </div>
    </li>
  );
}

function ActivityViewIntro({ title, description }) {
  return (
    <div className="border-b border-[var(--theme-border)] px-5 py-3">
      <h3 className="theme-heading text-sm font-medium">{title}</h3>
      <p className="theme-subtext mt-0.5 text-xs leading-relaxed">{description}</p>
    </div>
  );
}

function EmptyTabState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-[var(--theme-surface-muted)] p-3 text-[var(--theme-text-subtle)]">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="theme-subtext mt-3 text-sm">{message}</p>
    </div>
  );
}

export function ProductsCodeScreen() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { capabilities, user } = useAuth();
  const includeShelfLocation = isProductShelfLocationEnabled(capabilities);
  const productCodeRaw = params?.code;
  const productCode =
    productCodeRaw != null && String(productCodeRaw) !== "" && String(productCodeRaw) !== "undefined"
      ? decodeURIComponent(String(productCodeRaw))
      : "";

  const initialTabs = parsePageTabs(searchParams);
  const [mainTab, setMainTab] = useState(initialTabs.mainTab);
  const [activityView, setActivityView] = useState(initialTabs.activityView);

  const [product, setProduct] = useState(null);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [vats, setVats] = useState([]);
  const [retailPackage, setRetailPackage] = useState(null);
  const [globalReorderLevel, setGlobalReorderLevel] = useState(null);
  const [purchaseRows, setPurchaseRows] = useState([]);
  const [saleRows, setSaleRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const subById = useMemo(() => new Map(subCategories.map((s) => [s.id, s])), [subCategories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);
  const uomById = useMemo(() => {
    const map = new Map();
    for (const uom of uoms) {
      if (uom?.id == null) continue;
      map.set(uom.id, uom);
      map.set(String(uom.id), uom);
    }
    return map;
  }, [uoms]);
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const productAudit = useMemo(
    () => resolveProductAudit(product, userById),
    [product, userById],
  );

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
    const shop = Number(
      enriched.branch_stock?.shop_quantity ??
        enriched.stock_on_hand_shop ??
        enriched.stock_in_shop ??
        0,
    );
    const store = Number(
      enriched.branch_stock?.store_quantity ??
        enriched.stock_on_hand_store ??
        enriched.stock_in_store ??
        0,
    );
    const total = shop + store;
    const cost = Number(enriched.last_cost_price ?? 0);
    const sell = Number(enriched.unit_price ?? 0);
    const uom = enriched.product_uom;
    const factor = enriched.uom_factor;
    const sellOnRetail =
      enriched.sell_on_retail === 1 || enriched.sell_on_retail === true;
    const packQty = factor > 1 ? baseToDisplayQty(total, factor) : total;

    return {
      atCost: packQty * cost,
      atSelling:
        stockSellingValue(shop, sell, uom, enriched.retail_package, sellOnRetail) +
        stockSellingValue(store, sell, uom, enriched.retail_package, sellOnRetail),
      packQty,
    };
  }, [enriched]);

  const reorderLabel = useMemo(() => {
    if (!enriched) return "—";
    const pack = enriched.uom_label;
    const rp = Number(enriched.reorder_point ?? 0);
    if (rp > 0) {
      const packs = baseToDisplayQty(rp, enriched.uom_factor);
      return `${formatQty(packs)} ${pack} — alert when total stock falls below this`;
    }
    if (globalReorderLevel != null) {
      const packs = baseToDisplayQty(globalReorderLevel, enriched.uom_factor);
      return `${formatQty(packs)} ${pack} (organisation default)`;
    }
    return "Organisation default";
  }, [enriched, globalReorderLevel]);

  const priceUnitLabel = useMemo(() => {
    if (!enriched) return "unit";
    return uomHasFullPack(enriched.product_uom) ? enriched.uom_label : "unit";
  }, [enriched]);

  const retailTierLines = useMemo(() => {
    if (!enriched?.retail_package) return [];
    return formatRetailTiersSummary(enriched.retail_package, enriched.product_uom);
  }, [enriched]);

  const loadMeta = useCallback(async () => {
    const orgId = user?.organization_id;
    const [cats, subs, sups, uoms, vats, retailRows, settingsRes, usersData] = await Promise.all([
      fetchCategoriesCached(orgId),
      fetchSubCategoriesCached(orgId),
      fetchSuppliersCached(orgId),
      fetchUomsCached(orgId),
      fetchVatsCached(orgId),
      fetchRetailPackagesCached(orgId).catch(() => []),
      apiRequest("/system-settings", { searchParams: { per_page: 1 } }).catch(() => null),
      fetchUsersCached(orgId).catch(() => []),
    ]);
    setCategories(cats ?? []);
    setSubCategories(subs ?? []);
    setSuppliers(sups ?? []);
    setUoms(uoms ?? []);
    setVats(vats ?? []);
    setUsers(usersData ?? []);
    const matched = (retailRows ?? []).find(
      (row) => String(row.product_code) === String(productCode),
    );
    setRetailPackage(matched ?? null);
    const settingsRows = settingsRes?.data ?? settingsRes ?? [];
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
    const threshold = settings?.global_low_stock_threshold;
    setGlobalReorderLevel(
      threshold != null && threshold !== "" ? Number(threshold) : null,
    );
  }, [productCode, user?.organization_id]);

  const loadProduct = useCallback(async () => {
    if (!productCode) return;
    const searchParams = {};
    if (user?.branch_id) searchParams.branch_id = user.branch_id;
    const res = await apiRequest(`/products/${encodeURIComponent(productCode)}`, { searchParams });
    setProduct(res.data ?? res);
  }, [productCode, user?.branch_id]);

  const loadTabData = useCallback(async () => {
    if (mainTab !== "activity" || activityView === "stock") return;

    setTabLoading(true);
    try {
      if (activityView === "purchases") {
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
        setPurchaseRows(buildPurchaseRows(lpoLines, receiptTxns, enriched?.product_uom ?? null));
      } else if (activityView === "sales") {
        const itemsRes = await apiRequest("/sale-items", {
          searchParams: {
            per_page: 50,
            "filter[product_code]": productCode,
          },
        });
        setSaleRows(buildSaleRows(itemsRes.data ?? [], productCode, enriched?.product_uom ?? null));
      }
    } finally {
      setTabLoading(false);
    }
  }, [mainTab, activityView, productCode]);

  const loadAll = useCallback(async () => {
    if (!productCode) {
      setLoading(false);
      setError("Product not found");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadMeta(), loadProduct()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [loadMeta, loadProduct, productCode]);

  useTabAwareDataLoad(loadAll);

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

  usePageNavigationReady(!loading);

  async function confirmDelete() {
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      await apiRequest(`/products/${encodeURIComponent(productCode)}`, { method: "DELETE" });
      router.push(productsCatalogHref());
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setDeleteSaving(false);
    }
  }

  if (loading) {
    return null;
  }

  if (error || !enriched) {
    return (
      <div className="p-8">
        <AppBreadcrumb
          items={[
            { label: "Products", href: productsCatalogHref() },
            { label: productCode },
          ]}
        />
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
        : 0;

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Products", href: productsCatalogHref() },
          { label: enriched.product_name || enriched.product_code },
        ]}
      />

      {/* Hero */}
      <div className="mb-6 theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <div className="bg-gradient-to-r from-[var(--theme-primary-subtle)] via-[var(--theme-surface)] to-[var(--theme-surface)] px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge active={enriched.is_active} />
                <StockBadge tone={stock.tone} label={stock.label} />
                {enriched.sell_on_retail_label === "Sells W/R" ? (
                  <span className="inline-flex rounded-full bg-[var(--theme-primary-subtle)] px-2.5 py-0.5 text-xs font-medium text-[var(--theme-accent-text)] ring-1 ring-[var(--theme-border)]">
                    Retail
                  </span>
                ) : null}
              </div>
              <h1 className="theme-heading mt-3 text-2xl font-semibold tracking-tight">
                {enriched.product_name}
              </h1>
              <div className="theme-text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="theme-heading font-mono">{enriched.product_code}</span>
                <span className="text-[var(--theme-border-strong)]">·</span>
                <span>{enriched.category_name}</span>
                <span className="text-[var(--theme-border-strong)]">/</span>
                <span>{enriched.subcategory_name}</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/products/${encodeURIComponent(productCode)}/edit`}
                className="theme-primary-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-medium shadow-sm"
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
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <div className="border-b border-[var(--theme-border)] px-4 py-2">
          <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--theme-surface-muted)] p-0.5">
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
                label="Total available"
                value={enriched.stock_total_text}
                hint={`Shop: ${enriched.stock_shop_text} · Store: ${enriched.stock_store_text}`}
                accent="primary"
              />
              <MetricCard
                label="Stock value (cost)"
                value={stockValue ? formatKes(stockValue.atCost) : "—"}
                hint={
                  enriched.total_stock > 0 && stockValue
                    ? `${formatQty(stockValue.packQty)} ${priceUnitLabel} × ${formatKes(enriched.last_cost_price)}`
                    : undefined
                }
                accent="success"
              />
              <MetricCard
                label={`Wholesale price / ${priceUnitLabel}`}
                value={formatKes(enriched.unit_price)}
                hint={
                  profitMargin != null
                    ? `${profitMargin}% margin · ${enriched.pricing_mode}`
                    : enriched.pricing_mode
                }
                accent="accent"
              />
              <MetricCard
                label="Stock value (selling)"
                value={stockValue ? formatKes(stockValue.atSelling) : "—"}
                hint={
                  enriched.pricing_mode === "Sells W/R"
                    ? "Uses retail tier markups when configured"
                    : enriched.total_stock > 0 && stockValue
                      ? `${formatQty(stockValue.packQty)} ${priceUnitLabel} × ${formatKes(enriched.unit_price)}`
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
                <DetailItem label="Unit of measure">
                  <span>{enriched.uom_hierarchy}</span>
                  {enriched.uom_conversion ? (
                    <span className="theme-subtext mt-0.5 block text-xs">{enriched.uom_conversion}</span>
                  ) : null}
                </DetailItem>
                <DetailItem label="Supplier">{enriched.supplier_name}</DetailItem>
                <DetailItem label="Product weight">
                  {enriched.product_weight != null && enriched.product_weight !== ""
                    ? `${formatQty(enriched.product_weight)} kg`
                    : "—"}
                </DetailItem>
              </SectionCard>

              <SectionCard
                title="Pricing & tax"
                description={`Wholesale prices per ${priceUnitLabel} — same unit used on LPO and invoices`}
              >
                <DetailItem label={`Cost price / ${priceUnitLabel}`}>
                  {formatKes(enriched.last_cost_price)}
                </DetailItem>
                <DetailItem label={`Selling price / ${priceUnitLabel}`}>
                  {formatKes(enriched.unit_price)}
                </DetailItem>
                <DetailItem label={`Last selling price / ${priceUnitLabel}`}>
                  {formatKes(enriched.last_selling_price)}
                </DetailItem>
                <DetailItem label={`Discount on ${priceUnitLabel}`}>
                  {enriched.discount_label}
                </DetailItem>
                <DetailItem label="Pricing channel">{enriched.pricing_mode}</DetailItem>
                <DetailItem label="VAT status">{enriched.vat_label}</DetailItem>
                <DetailItem label="Profit margin">
                  {profitMargin != null ? `${profitMargin}%` : "—"}
                </DetailItem>
              </SectionCard>

              <SectionCard title="Inventory" description="Available stock after reservations (same as catalogue and mobile)">
                <DetailItem label="Available in shop">{enriched.stock_shop_text}</DetailItem>
                <DetailItem label="Available in store">{enriched.stock_store_text}</DetailItem>
                {includeShelfLocation ? (
                  <DetailItem label="Warehouse shelf">
                    {enriched.shelf_location?.trim() ? enriched.shelf_location : "—"}
                  </DetailItem>
                ) : null}
                <DetailItem label="Reorder level">{reorderLabel}</DetailItem>
                <DetailItem label="Retail sales">{enriched.sell_on_retail_label}</DetailItem>
              </SectionCard>

              <SectionCard title="Record" description="Audit trail">
                <DetailItem label={productAudit.label}>
                  <UserDateCell name={productAudit.name} date={productAudit.date} />
                </DetailItem>
                <DetailItem label="Status">
                  <StatusBadge active={enriched.is_active} />
                </DetailItem>
              </SectionCard>
            </div>

            {retail ? (
              <section className="rounded-xl border border-[var(--theme-border)] bg-gradient-to-br from-[var(--theme-primary-subtle)] to-[var(--theme-surface)] shadow-sm">
                <div className="border-b border-[var(--theme-border)] px-5 py-3.5">
                  <h2 className="theme-accent-label text-sm font-semibold">Retail package settings</h2>
                  <p className="theme-subtext mt-0.5 text-xs">
                    Tier markups on wholesale price per {priceUnitLabel} — quantities use UOM measure
                    levels
                  </p>
                </div>
                <div className="p-5">
                  {retailTierLines.length > 0 ? (
                    <ul className="theme-text-muted space-y-2 text-sm">
                      {retailTierLines.map((line, i) => (
                        <li
                          key={i}
                          className="theme-inset-panel rounded-lg border px-3 py-2"
                        >
                          {line}
                        </li>
                      ))}
                      <li className="theme-subtext text-xs">
                        Outside all tiers = wholesale ({formatKes(enriched.unit_price)} per{" "}
                        {priceUnitLabel}, no markup).
                      </li>
                    </ul>
                  ) : (
                    <p className="theme-subtext text-sm">No retail tiers configured.</p>
                  )}
                  <Link
                    href="/retail-package-settings"
                    className="theme-link mt-3 inline-block text-xs font-medium hover:underline"
                  >
                    Edit in Retail package settings →
                  </Link>
                </div>
              </section>
            ) : enriched.pricing_mode === "Sells W/R" ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50/50 px-5 py-4 text-sm text-amber-900">
                Sells on retail but no package tiers configured.{" "}
                <Link href="/retail-package-settings" className="font-medium underline">
                  Add retail package setting
                </Link>
              </section>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-2">
              <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--theme-surface-muted)] p-0.5">
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
              <p className="theme-subtext text-xs">
                {activityView === "stock"
                  ? "Movement ledger"
                  : activeActivity.countLabel(activityCount)}
              </p>
            </div>

            <ActivityViewIntro
              title={activeActivity.label}
              description={activeActivity.description}
            />

            <div className="px-5 py-2">
              {activityView === "stock" ? (
                <ProductStockHistoryPanel
                  productCode={productCode}
                  productName={enriched.product_name}
                  uom={enriched.product_uom}
                  uomById={uomById}
                  shopStock={
                    enriched.branch_stock?.shop_quantity ??
                    enriched.stock_on_hand_shop ??
                    enriched.stock_in_shop ??
                    0
                  }
                  storeStock={
                    enriched.branch_stock?.store_quantity ??
                    enriched.stock_on_hand_store ??
                    enriched.stock_in_store ??
                    0
                  }
                  userById={userById}
                  emptyMessage={activeActivity.emptyMessage}
                />
              ) : null}

              {activityView === "purchases" ? (
                tabLoading ? (
                  <p className="theme-subtext py-8 text-center text-sm">
                    {activeActivity.loadingMessage}
                  </p>
                ) : purchaseRows.length === 0 ? (
                  <EmptyTabState message={activeActivity.emptyMessage} />
                ) : (
                  <ul className="divide-y divide-[var(--theme-border)]">
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
                  <p className="theme-subtext py-8 text-center text-sm">
                    {activeActivity.loadingMessage}
                  </p>
                ) : saleRows.length === 0 ? (
                  <EmptyTabState message={activeActivity.emptyMessage} />
                ) : (
                  <ul className="divide-y divide-[var(--theme-border)]">
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
