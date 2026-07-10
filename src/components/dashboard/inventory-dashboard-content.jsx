"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import { formatInventoryKes } from "@/components/inventory/inventory-shared";
import { formatInventoryQtyWithUom } from "@/lib/inventory-qty-display";
import {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { DonutChart, CHART_COLORS } from "@/components/reports/report-charts";
import { formatReportKes } from "@/lib/reports/format";
import {
  ITEMS_CURRENTLY_IN_STOCK_DESC,
  ITEMS_CURRENTLY_IN_STOCK_HREF,
  ITEMS_CURRENTLY_IN_STOCK_LABEL,
} from "@/lib/inventory-routes";

const INVENTORY_LINKS = [
  {
    href: ITEMS_CURRENTLY_IN_STOCK_HREF,
    title: ITEMS_CURRENTLY_IN_STOCK_LABEL,
    desc: ITEMS_CURRENTLY_IN_STOCK_DESC,
  },
  { href: "/inventory/receipts", title: "Stock receipts", desc: "Goods received into inventory" },
  { href: "/inventory/adjustments", title: "Stock adjustments", desc: "Increase or decrease shop/store stock" },
  { href: "/inventory/transactions", title: "Movements", desc: "Transfers, adjustments, issues" },
  { href: "/inventory/transfers/new", title: "Transfer stock", desc: "Move stock between locations" },
  { href: "/inventory/damages", title: "Damages", desc: "Write-offs and damaged stock" },
  { href: "/inventory/stock-take", title: "Stock take", desc: "Physical count and reconciliation" },
  { href: "/reports/low-stock", title: "Low stock report", desc: "Items at or below reorder" },
];

export function InventoryDashboardContent() {
  const { user, isOrgWide } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [lowStockRows, setLowStockRows] = useState([]);
  const [inventoryValue, setInventoryValue] = useState({ shop: null, store: null, total: null });

  useEffect(() => {
    const valuationParams = {};
    if (user?.branch_id && !isOrgWide()) {
      valuationParams.branch_id = user.branch_id;
    }

    Promise.all([
      apiRequest("/reports/stock-on-hand", {
        searchParams: { per_page: 200, ...valuationParams },
      }),
      apiRequest("/reports/low-stock", { searchParams: { per_page: 10, ...valuationParams } }),
      apiRequest("/reports/inventory-valuation-summary", { searchParams: valuationParams }),
    ])
      .then(([stockRes, lowRes, valuationRes]) => {
        setStockRows(stockRes.data ?? []);
        setLowStockRows(lowRes.data ?? []);
        setInventoryValue({
          shop: valuationRes?.shop_value ?? null,
          store: valuationRes?.store_value ?? null,
          total: valuationRes?.value ?? null,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load inventory dashboard"))
      .finally(() => setLoading(false));
  }, [user?.branch_id, user?.access_scope, user?.is_admin]);

  const stats = useMemo(() => {
    const availableTotal = (r) =>
      Number(r.available_shop_quantity ?? r.shop_quantity ?? 0) +
      Number(r.available_store_quantity ?? r.store_quantity ?? 0);
    const inStock = stockRows.filter((r) => availableTotal(r) > 0);
    const low = stockRows.filter((r) => {
      const qty = availableTotal(r);
      if (qty <= 0) return true;
      return r.product_alert === "REORDER";
    }).length;
    const out = stockRows.filter((r) => availableTotal(r) <= 0).length;
    const totalQty = inStock.reduce((sum, r) => sum + availableTotal(r), 0);
    return {
      skus: inStock.length,
      totalQty,
      low,
      out,
      availableTotal,
    };
  }, [stockRows]);

  const inStockItems = useMemo(
    () =>
      [...stockRows]
        .filter((r) => stats.availableTotal(r) > 0)
        .sort((a, b) => stats.availableTotal(b) - stats.availableTotal(a))
        .slice(0, 10)
        .map((r) => ({
          ...r,
          available_total_units: stats.availableTotal(r),
        })),
    [stockRows, stats],
  );

  const topByQty = useMemo(
    () =>
      [...stockRows]
        .sort((a, b) => stats.availableTotal(b) - stats.availableTotal(a))
        .slice(0, 6)
        .map((r, i) => ({
          label: (r.product_name ?? r.product_code ?? "—").slice(0, 18),
          value: stats.availableTotal(r),
          color: CHART_COLORS[i % CHART_COLORS.length],
        })),
    [stockRows, stats],
  );

  const kpiItems = [
    {
      id: "shop_value",
      label: "Shop value",
      value: inventoryValue.shop != null ? formatReportKes(inventoryValue.shop) : "—",
      hint: "Converted qty × cost in shop",
    },
    {
      id: "store_value",
      label: "Store value",
      value: inventoryValue.store != null ? formatReportKes(inventoryValue.store) : "—",
      hint: "Converted qty × cost in store",
    },
    {
      id: "total_value",
      label: "Total stock value",
      value: inventoryValue.total != null ? formatReportKes(inventoryValue.total) : "—",
      hint: "Shop + store at cost (on hand)",
    },
    { id: "skus", label: "SKUs in stock", value: stats.skus.toLocaleString(), hint: "With available quantity" },
    { id: "low", label: "Low stock", value: stats.low.toLocaleString(), hint: "Below reorder point" },
    { id: "out", label: "Out of stock", value: stats.out.toLocaleString(), hint: "Zero available" },
  ];

  return (
    <CatalogPageShell
      title="Inventory dashboard"
      subtitle="Stock health, valuation, and warehouse activity"
      action={<PrimaryLink href="/inventory/receipts/receive">Receive stock</PrimaryLink>}
    >
      <DashboardErrorBanner message={error} />

      {loading ? (
        <DashboardLoading />
      ) : (
        <div className="space-y-8">
          <DashboardKpiGrid items={kpiItems} />

          <div className="grid gap-4 xl:grid-cols-3">
            <DashboardPanel title="Top products by quantity" subtitle="Highest available units" className="xl:col-span-2">
              <DonutChart segments={topByQty} loading={false} emptyMessage="No stock data." />
            </DashboardPanel>
            <DashboardPanel
              title="Stock summary"
              subtitle="Quick totals"
            >
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Total units available</dt>
                  <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {stats.totalQty.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Low stock alerts</dt>
                  <dd className="font-medium text-amber-700">{stats.low}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Out of stock</dt>
                  <dd className="font-medium text-red-700">{stats.out}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <dt className="text-slate-500">Shop value (converted qty × cost)</dt>
                  <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {inventoryValue.shop != null ? formatInventoryKes(inventoryValue.shop) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Store value (converted qty × cost)</dt>
                  <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                    {inventoryValue.store != null ? formatInventoryKes(inventoryValue.store) : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <dt className="text-slate-500">Total stock value</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {inventoryValue.total != null ? formatInventoryKes(inventoryValue.total) : "—"}
                  </dd>
                </div>
              </dl>
            </DashboardPanel>
          </div>

          <DashboardSection
            title={ITEMS_CURRENTLY_IN_STOCK_LABEL}
            subtitle="Products with available quantity right now"
            action={
              <Link href={ITEMS_CURRENTLY_IN_STOCK_HREF} className="text-sm text-[#185FA5] hover:underline">
                View all
              </Link>
            }
          >
            <DashboardSummaryTable
              columns={[
                { key: "product_name", label: "Product" },
                { key: "available_total_units", label: "Available", align: "right" },
              ]}
              rows={inStockItems}
              emptyMessage="No items currently in stock."
              formatValue={(key, value, row) =>
                key === "available_total_units"
                  ? formatInventoryQtyWithUom(value, row)
                  : value
              }
              viewAllHref={ITEMS_CURRENTLY_IN_STOCK_HREF}
              viewAllLabel={`Open ${ITEMS_CURRENTLY_IN_STOCK_LABEL.toLowerCase()} →`}
            />
          </DashboardSection>

          <DashboardSection
            title="Low stock items"
            subtitle="Products at or below reorder point"
            action={
              <Link href="/reports/low-stock" className="text-sm text-[#185FA5] hover:underline">
                Full report
              </Link>
            }
          >
            <DashboardSummaryTable
              columns={[
                { key: "product_name", label: "Product" },
                { key: "available_total_units", label: "Available", align: "right" },
                { key: "reorder_point", label: "Reorder", align: "right" },
              ]}
              rows={lowStockRows.map((r) => ({
                ...r,
                available_total_units:
                  Number(r.available_shop_quantity ?? r.shop_quantity ?? 0) +
                  Number(r.available_store_quantity ?? r.store_quantity ?? 0),
              }))}
              formatValue={(key, value, row) =>
                key === "available_total_units" || key === "reorder_point"
                  ? formatInventoryQtyWithUom(value, row)
                  : value
              }
              viewAllHref="/reports/low-stock"
            />
          </DashboardSection>

          <DashboardSection title="Inventory tools">
            <DashboardQuickLinks links={INVENTORY_LINKS} />
          </DashboardSection>
        </div>
      )}
    </CatalogPageShell>
  );
}
