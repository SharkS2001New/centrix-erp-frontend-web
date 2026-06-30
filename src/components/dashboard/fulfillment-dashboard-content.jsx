"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import {
  countDeliveriesByDriver,
  todayDeliveryStats,
} from "@/components/fulfillment/fulfillment-shared";
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

const FULFILLMENT_LINKS = [
  { href: "/fulfillment/drivers", title: "Drivers", desc: "Driver roster and assignments" },
  { href: "/fulfillment/vehicles", title: "Vehicles", desc: "Fleet and capacity" },
  { href: "/fulfillment/routes", title: "Routes", desc: "Delivery routes and schedules" },
  { href: "/fulfillment/orders", title: "Route orders", desc: "Orders on delivery routes" },
];

export function FulfillmentDashboardContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [sales, setSales] = useState([]);

  useEffect(() => {
    Promise.all([
      apiRequest("/drivers", { searchParams: { per_page: 200 } }),
      apiRequest("/routes", { searchParams: { per_page: 200 } }),
      apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
      apiRequest("/sales", { searchParams: { per_page: 500, with_items: 0 } }),
    ])
      .then(([driverRes, routeRes, vehicleRes, salesRes]) => {
        setDrivers(driverRes.data ?? []);
        setRoutes(routeRes.data ?? []);
        setVehicles(vehicleRes.data ?? []);
        setSales(salesRes.data ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load fulfillment dashboard"))
      .finally(() => setLoading(false));
  }, []);

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
        name: d.driver_name ?? d.driver_code ?? "—",
        route: routes.find((r) => r.id === d.route_id)?.route_name ?? "—",
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
      action={<PrimaryLink href="/fulfillment/drivers">Manage drivers</PrimaryLink>}
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
