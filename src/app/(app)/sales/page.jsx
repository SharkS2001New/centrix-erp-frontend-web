"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryLink,
} from "@/components/catalog/catalog-shared";
import { HourlySalesChart } from "@/components/sales/sales-shared";
import { OrderSummaryStats, summarizeOrders } from "@/components/sales/sales-orders-shared";
import {
  buildHourlySalesChart,
  filterSalesByPeriod,
} from "@/lib/sales";

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

  return (
    <CatalogPageShell
      title="Sales dashboard"
      subtitle="Today's performance — open POS to start selling"
      action={
        <div className="flex flex-wrap gap-2">
          <PrimaryLink href="/sales/pos" showIcon={false}>
            Open POS
          </PrimaryLink>
          <Link
            href="/sales/orders"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View orders
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
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-medium text-slate-900">Order summary</h2>
            <p className="mt-0.5 text-xs text-slate-500">Today&apos;s orders (excluding held)</p>
            <div className="mt-4">
              <OrderSummaryStats summary={orderSummary} hint="Today" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-900">Hourly sales chart</h2>
            <p className="mt-0.5 text-xs text-slate-500">Revenue by hour (today)</p>
            <div className="mt-4">
              <HourlySalesChart points={hourly} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuickLink href="/sales/pos" title="Point of sale" desc="Search products, cart, checkout" />
            <QuickLink href="/sales/orders" title="Orders" desc="Search and manage sales orders" />
            <QuickLink href="/sales/reservations" title="Reservations" desc="Stock held for pending orders" />
            <QuickLink href="/sales/returns" title="Returns" desc="Customer sale returns" />
          </div>
        </div>
      )}
    </CatalogPageShell>
  );
}

function QuickLink({ href, title, desc }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#185FA5]/30 hover:shadow"
    >
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{desc}</p>
    </Link>
  );
}
