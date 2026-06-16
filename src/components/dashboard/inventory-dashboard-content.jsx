"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import { formatInventoryKes } from "@/components/inventory/inventory-shared";
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

const INVENTORY_LINKS = [
  { href: "/inventory/stock", title: "Current stock", desc: "On-hand quantities and valuation" },
  { href: "/inventory/receipts", title: "Stock receipts", desc: "Goods received into inventory" },
  { href: "/inventory/transactions", title: "Movements", desc: "Transfers, adjustments, issues" },
  { href: "/inventory/transfers/new", title: "Transfer stock", desc: "Move stock between locations" },
  { href: "/inventory/damages", title: "Damages", desc: "Write-offs and damaged stock" },
  { href: "/inventory/stock-take", title: "Stock take", desc: "Physical count and reconciliation" },
  { href: "/reports/stock-on-hand", title: "Stock on hand report", desc: "Full inventory valuation" },
  { href: "/reports/low-stock", title: "Low stock report", desc: "Items at or below reorder" },
];

export function InventoryDashboardContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stockRows, setStockRows] = useState([]);
  const [lowStockRows, setLowStockRows] = useState([]);
  const [inventoryValue, setInventoryValue] = useState(null);

  useEffect(() => {
    Promise.all([
      apiRequest("/reports/stock-on-hand", { searchParams: { per_page: 200 } }),
      apiRequest("/reports/low-stock", { searchParams: { per_page: 10 } }),
      apiRequest("/reports/dashboard"),
    ])
      .then(([stockRes, lowRes, dashRes]) => {
        setStockRows(stockRes.data ?? []);
        setLowStockRows(lowRes.data ?? []);
        setInventoryValue(dashRes?.kpis?.inventory_value?.value ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load inventory dashboard"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const low = stockRows.filter((r) => r.product_alert === "REORDER" && Number(r.total_base_units) > 0).length;
    const out = stockRows.filter((r) => Number(r.total_base_units) <= 0).length;
    const totalQty = stockRows.reduce((sum, r) => sum + Number(r.total_base_units ?? 0), 0);
    return {
      skus: stockRows.length,
      totalQty,
      low,
      out,
    };
  }, [stockRows]);

  const topByQty = useMemo(
    () =>
      [...stockRows]
        .sort((a, b) => Number(b.total_base_units ?? 0) - Number(a.total_base_units ?? 0))
        .slice(0, 6)
        .map((r, i) => ({
          label: (r.product_name ?? r.product_code ?? "—").slice(0, 18),
          value: Number(r.total_base_units ?? 0),
          color: CHART_COLORS[i % CHART_COLORS.length],
        })),
    [stockRows],
  );

  const kpiItems = [
    { id: "value", label: "Inventory value", value: inventoryValue != null ? formatReportKes(inventoryValue) : "—" },
    { id: "skus", label: "SKUs tracked", value: stats.skus.toLocaleString() },
    { id: "low", label: "Low stock", value: stats.low.toLocaleString(), hint: "Below reorder point" },
    { id: "out", label: "Out of stock", value: stats.out.toLocaleString(), hint: "Zero on hand" },
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
            <DashboardPanel title="Top products by quantity" subtitle="Highest on-hand units" className="xl:col-span-2">
              <DonutChart segments={topByQty} loading={false} emptyMessage="No stock data." />
            </DashboardPanel>
            <DashboardPanel
              title="Stock summary"
              subtitle="Quick totals"
            >
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Total units on hand</dt>
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
                  <dt className="text-slate-500">Retail value</dt>
                  <dd className="font-semibold text-slate-900 dark:text-slate-100">
                    {inventoryValue != null ? formatInventoryKes(inventoryValue) : "—"}
                  </dd>
                </div>
              </dl>
            </DashboardPanel>
          </div>

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
                { key: "total_base_units", label: "On hand", align: "right" },
                { key: "reorder_point", label: "Reorder", align: "right" },
              ]}
              rows={lowStockRows}
              formatValue={(key, value) =>
                key === "total_base_units" || key === "reorder_point"
                  ? Number(value ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })
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
