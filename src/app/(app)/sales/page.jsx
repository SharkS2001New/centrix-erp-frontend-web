"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryLink,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import {
  DashboardPanel,
  DashboardQuickLinks,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { ReportsDashboardSection } from "@/components/dashboard/reports-dashboard-section";
import { HourlySalesChart } from "@/components/sales/sales-shared";
import { OrderSummaryStats, summarizeOrders } from "@/components/sales/sales-orders-shared";
import {
  buildHourlySalesChart,
  filterSalesByPeriod,
  formatSaleKes,
  saleCustomerLabel,
} from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";

const SALES_LINKS = [
  { href: "/sales/pos", title: "Create order", desc: "Search products, build a cart, and checkout" },
  { href: "/sales/orders", title: "Orders", desc: "Search and manage sales orders" },
  { href: "/sales/reservations", title: "Reservations", desc: "Stock held for pending orders" },
  { href: "/sales/returns", title: "Returns", desc: "Manage customer sale returns" },
];

export default function SalesDashboardPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest("/sales", {
        searchParams: { per_page: 200, with_items: 0, exclude_status: "held" },
      });
      setSales(res.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const todaySales = useMemo(() => filterSalesByPeriod(sales, "day"), [sales]);
  const orderSummary = useMemo(() => summarizeOrders(todaySales), [todaySales]);
  const hourly = useMemo(() => buildHourlySalesChart(sales), [sales]);

  const recentOrders = useMemo(
    () =>
      [...todaySales]
        .sort((a, b) => new Date(b.completed_at ?? b.created_at) - new Date(a.completed_at ?? a.created_at))
        .slice(0, 8)
        .map((sale) => ({
          id: sale.id,
          receipt: sale.receipt_number ?? sale.sale_id,
          customer: saleCustomerLabel(sale),
          total: sale.order_total,
          status: sale.status,
          time: sale.completed_at ?? sale.created_at,
        })),
    [todaySales],
  );

  return (
    <CatalogPageShell
      title="Sales dashboard"
      subtitle="Today's performance and period trends"
      action={
        <div className="flex flex-wrap gap-2">
          <PrimaryLink href="/sales/pos" showIcon={false}>
            Create order
          </PrimaryLink>
          <Link
            href="/sales/orders"
            className="theme-secondary-btn inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium"
          >
            View all orders
          </Link>
        </div>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null
      }
    >
      {loading ? (
        <p className="theme-subtext text-sm">Loading dashboard…</p>
      ) : (
        <div className="space-y-8">
          <DashboardSection title="Today's orders" subtitle="Excluding held orders">
            <OrderSummaryStats summary={orderSummary} hint="Today" />
          </DashboardSection>

          <DashboardPanel title="Hourly sales" subtitle="Revenue by hour (today)">
            <HourlySalesChart points={hourly} />
          </DashboardPanel>

          <ReportsDashboardSection compact showFilters workspaceScope="sales" />

          <DashboardSection
            title="Recent orders today"
            action={
              <Link href="/sales/orders" className="theme-link text-sm">
                View all
              </Link>
            }
          >
            <DashboardSummaryTable
              columns={[
                { key: "receipt", label: "Receipt", mono: true },
                { key: "customer", label: "Customer" },
                { key: "total", label: "Total", align: "right" },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => <SaleStatusBadge status={row.status} />,
                },
                {
                  key: "time",
                  label: "Time",
                  render: (row) => formatShortDate(row.time),
                },
              ]}
              rows={recentOrders}
              formatValue={(key, value) => (key === "total" ? formatSaleKes(value) : value)}
              viewAllHref="/sales/orders"
            />
          </DashboardSection>

          <DashboardSection title="Sales tools">
            <DashboardQuickLinks links={SALES_LINKS} />
          </DashboardSection>
        </div>
      )}
    </CatalogPageShell>
  );
}
