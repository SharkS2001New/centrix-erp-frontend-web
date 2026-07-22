"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { fetchFulfillmentRefsCached } from "@/lib/reference-data-cache";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import {
  countDeliveriesByDriver,
  driverDisplayName,
  todayDeliveryStats,
} from "@/components/fulfillment/fulfillment-shared";
import {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { DonutChart, CHART_COLORS } from "@/components/reports/report-charts";
import { toLocalDateInputValue } from "@/lib/dashboard-dates";

const FULFILLMENT_LINKS = [
  { href: "/fulfillment/drivers", title: "Drivers", desc: "Driver roster and assignments" },
  { href: "/fulfillment/vehicles", title: "Vehicles", desc: "Fleet and capacity" },
  { href: "/fulfillment/routes", title: "Routes", desc: "Delivery routes and schedules" },
  { href: "/fulfillment/orders", title: "Route orders", desc: "Orders on delivery routes" },
];

export function FulfillmentDashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [sales, setSales] = useState([]);

  const loadDashboard = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const today = toLocalDateInputValue();
    try {
      const [refs, salesRes] = await Promise.all([
        fetchFulfillmentRefsCached(user?.organization_id),
        apiRequest("/sales", {
          searchParams: {
            per_page: 200,
            with_items: 0,
            from_date: today,
            to_date: today,
            date_field: "placed",
          },
        }),
      ]);
      setDrivers(refs.drivers ?? []);
      setRoutes(refs.routes ?? []);
      setVehicles(refs.vehicles ?? []);
      setSales(salesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fulfillment dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.organization_id]);

  useTabAwareDataLoad(loadDashboard);

  const stats = useMemo(() => {
    const activeDrivers = drivers.filter((d) => d.is_active !== false);
    const activeRoutes = routes.filter((r) => r.is_active !== false);
    const activeVehicles = vehicles.filter((v) => v.is_active !== false);
    const deliveriesByDriver = countDeliveriesByDriver(sales, "day");
    let deliveriesToday = 0;
    for (const count of deliveriesByDriver.values()) deliveriesToday += count;
    const { completed, pending } = todayDeliveryStats(sales);
    return {
      drivers: drivers.length,
      activeDrivers: activeDrivers.length,
      routes: activeRoutes.length,
      vehicles: activeVehicles.length,
      deliveriesToday,
      completedToday: completed,
      pendingToday: pending,
    };
  }, [drivers, routes, vehicles, sales]);

  const routeSegments = useMemo(() => {
    const counts = new Map();
    for (const driver of drivers.filter((d) => d.is_active !== false)) {
      const route = routes.find((r) => r.id === driver.default_route_id);
      const label = route?.route_name ?? "Unassigned";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({
        label,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [drivers, routes]);

  const topDrivers = useMemo(() => {
    const deliveriesByDriver = countDeliveriesByDriver(sales, "day");
    return [...drivers]
      .map((d) => ({
        id: d.id,
        name: driverDisplayName(d),
        route:
          routes.find((r) => r.id === (d.default_route_id ?? d.route_id))?.route_name ?? "—",
        deliveries: deliveriesByDriver.get(d.id) ?? 0,
        status: d.is_active === false ? "Inactive" : "Active",
      }))
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 6);
  }, [drivers, routes, sales]);

  const kpiItems = [
    { id: "drivers", label: "Drivers", value: `${stats.activeDrivers}/${stats.drivers}`, hint: "Active / total" },
    { id: "routes", label: "Active routes", value: stats.routes.toLocaleString() },
    { id: "vehicles", label: "Active vehicles", value: stats.vehicles.toLocaleString() },
    {
      id: "deliveries",
      label: "Today's deliveries",
      value: stats.deliveriesToday.toLocaleString(),
      hint: `${stats.completedToday} completed · ${stats.pendingToday} pending`,
    },
  ];

  return (
    <CatalogPageShell
      title="Distribution dashboard"
      subtitle="Drivers, routes, and today's delivery performance"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <DashboardRefreshButton onClick={() => void loadDashboard({ soft: true })} loading={loading || refreshing} />
          <PrimaryLink href="/fulfillment/drivers">Manage drivers</PrimaryLink>
        </div>
      }
    >
      <DashboardErrorBanner message={error} />

      {loading ? (
        <DashboardLoading />
      ) : (
        <div className="space-y-8">
          <DashboardKpiGrid items={kpiItems} />

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanel title="Drivers by route" subtitle="Active driver assignments">
              <DonutChart segments={routeSegments} loading={false} emptyMessage="No drivers assigned yet." />
            </DashboardPanel>
            <DashboardPanel title="Delivery status (today)" subtitle="Completed vs pending">
              <DonutChart
                segments={[
                  { label: "Completed", value: stats.completedToday, color: CHART_COLORS[1] },
                  { label: "Pending", value: stats.pendingToday, color: CHART_COLORS[3] },
                ].filter((s) => s.value > 0)}
                loading={false}
                emptyMessage="No deliveries scheduled today."
              />
            </DashboardPanel>
          </div>

          <DashboardSection
            title="Driver activity today"
            action={
              <Link href="/fulfillment/drivers" className="text-sm text-[#185FA5] hover:underline">
                View drivers
              </Link>
            }
          >
            <DashboardSummaryTable
              columns={[
                { key: "name", label: "Driver" },
                { key: "route", label: "Route" },
                { key: "deliveries", label: "Deliveries", align: "right" },
                { key: "status", label: "Status" },
              ]}
              rows={topDrivers}
              viewAllHref="/fulfillment/drivers"
            />
          </DashboardSection>

          <DashboardSection title="Fulfillment tools">
            <DashboardQuickLinks links={FULFILLMENT_LINKS} />
          </DashboardSection>
        </div>
      )}
    </CatalogPageShell>
  );
}
