"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryLink,
} from "@/components/catalog/catalog-shared";
import {
  DashboardPanel,
  DashboardQuickLinks,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { ReportsDashboardSection } from "@/components/dashboard/reports-dashboard-section";
import { HourlySalesChart } from "@/components/sales/sales-shared";
import { OrderSummaryStats, summarizeOrders } from "@/components/sales/sales-orders-shared";
import { SaleCreatedByCell } from "@/components/sales/sales-orders-columns";
import {
  buildHourlySalesChart,
  formatReceiptNumber,
  formatSaleKes,
  saleCustomerLabel,
  salePlacedAt,
} from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";
import { todayCalendarDate } from "@/lib/datetime";

const SALES_LINKS = [
  { href: "/sales/pos", title: "Create order", desc: "Search products, build a cart, and checkout" },
  { href: "/sales/orders", title: "Orders", desc: "Search and manage sales orders" },
  { href: "/sales/reservations", title: "Reservations", desc: "Stock held for pending orders" },
  { href: "/sales/returns", title: "Returns", desc: "Manage customer sale returns" },
];

export function SalesScreen() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadData = useCallback(async ({ soft = false } = {}) => {
    const today = todayCalendarDate();
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      // Only today's placed orders — avoid pulling 200 historical rows just to filter client-side.
      const res = await apiRequest("/sales", {
        searchParams: {
          per_page: 100,
          with_items: 0,
          exclude_status: "held",
          from_date: today,
          to_date: today,
          date_field: "placed",
        },
      });
      setSales(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load sales");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);

  const orderSummary = useMemo(() => summarizeOrders(sales), [sales]);
  const hourly = useMemo(() => buildHourlySalesChart(sales), [sales]);

  const recentOrders = useMemo(
    () =>
      [...sales]
        .sort((a, b) => new Date(salePlacedAt(b)) - new Date(salePlacedAt(a)))
        .slice(0, 8)
        .map((sale) => ({
          id: sale.id,
          sale,
          receipt: formatReceiptNumber(sale),
          customer: saleCustomerLabel(sale),
          total: sale.order_total,
          status: sale.status,
        })),
    [sales],
  );

  return (
    <CatalogPageShell
      title="Sales dashboard"
      subtitle="Today's performance and period trends"
      action={
        <div className="flex flex-wrap gap-2">
          <DashboardRefreshButton
            onClick={() => void loadData({ soft: true })}
            loading={loading || refreshing}
          />
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
                  key: "placedBy",
                  label: "Placed by",
                  render: (row) => <SaleCreatedByCell sale={row.sale} />,
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
