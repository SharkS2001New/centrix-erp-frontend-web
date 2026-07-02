"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatOrderNumber } from "@/lib/sales";
import {
  aggregateSalesByRoute,
  formatRouteKes,
  isActiveRouteSale,
  isSaleInPeriod,
  normalizeRouteId,
} from "@/components/routes/route-form";
import { DistributionHelpButton } from "@/components/fulfillment/distribution-help";
import {
  FilterSelect,
  SALES_PERIOD_OPTIONS,
  StatCard,
  formatShortDate,
  getSaleTimestamp,
} from "@/components/catalog/catalog-shared";

export default function RouteDetailPage() {
  const params = useParams();
  const routeId = Number(params.id);

  const [route, setRoute] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [salesPeriod, setSalesPeriod] = useState("day");
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [routeData, custRes, salesRes] = await Promise.all([
        apiRequest(`/routes/${routeId}`),
        apiRequest("/customers", {
          searchParams: { per_page: 200, "filter[route_id]": routeId },
        }),
        apiRequest("/sales", {
          searchParams: {
            per_page: 200,
            route_orders: 1,
            route_id: routeId,
            exclude_statuses: "cancelled,expired,held",
          },
        }),
      ]);
      setRoute(routeData);
      setCustomers((custRes.data ?? []).filter((c) => !c.deleted_at));
      setSales(salesRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load route");
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const salesStats = useMemo(() => {
    const byRoute = aggregateSalesByRoute(sales, salesPeriod);
    return byRoute.get(normalizeRouteId(routeId)) ?? { total: 0, count: 0 };
  }, [sales, salesPeriod, routeId]);

  const recentSales = useMemo(
    () =>
      sales
        .filter((s) => isActiveRouteSale(s) && isSaleInPeriod(s, salesPeriod))
        .sort((a, b) => {
          const ta = getSaleTimestamp(a)?.getTime() ?? 0;
          const tb = getSaleTimestamp(b)?.getTime() ?? 0;
          return tb - ta;
        })
        .slice(0, 8),
    [sales, salesPeriod],
  );

  const periodLabel =
    SALES_PERIOD_OPTIONS.find((o) => o.value === salesPeriod)?.label ?? "Today";

  const isActive = useMemo(() => route && route.is_active !== false, [route]);

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/fulfillment/routes" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
            ← Back to routes
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <DistributionHelpButton />
            <h1 className="text-xl font-medium text-slate-900">Route details</h1>
          </div>
        </div>
        {route && (
          <Link
            href={`/fulfillment/routes?edit=${route.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
          >
            <PencilIcon />
            Edit route
          </Link>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading route…</p>
      ) : route ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{route.route_name}</h2>
              <p className="text-sm text-slate-500">{route.direction || "No region set"}</p>
            </div>
            <FilterSelect
              value={salesPeriod}
              onChange={(e) => setSalesPeriod(e.target.value)}
              options={SALES_PERIOD_OPTIONS}
            />
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Customers" value={String(customers.length)} />
            <StatCard
              label={`Sales · ${periodLabel.toLowerCase()}`}
              value={formatRouteKes(salesStats.total)}
            />
            <StatCard
              label={`Orders · ${periodLabel.toLowerCase()}`}
              value={String(salesStats.count)}
            />
            <StatCard label="Status" value={isActive ? "Active" : "Inactive"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="theme-panel rounded-xl border shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-[15px] font-medium text-slate-900">
                  Sales · {periodLabel.toLowerCase()}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Active route orders in this period (backoffice, mobile, and POS)
                </p>
              </div>
              {recentSales.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">
                  No sales in this period.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentSales.map((sale) => (
                    <li
                      key={sale.id ?? sale.order_num}
                      className="flex items-center justify-between gap-4 px-5 py-3.5"
                    >
                      <div>
                        <p className="font-medium text-slate-900">Order #{formatOrderNumber(sale)}</p>
                        <p className="text-xs text-slate-500">
                          {formatShortDate(getSaleTimestamp(sale))}
                        </p>
                      </div>
                      <p className="font-medium text-slate-800">
                        {formatRouteKes(sale.order_total)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="theme-panel rounded-xl border shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-[15px] font-medium text-slate-900">Customers under route</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Route-type customers assigned here
                </p>
              </div>
              {customers.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">
                  No customers on this route yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {customers.map((customer) => (
                    <li key={customer.customer_num} className="px-5 py-3.5 hover:bg-slate-50">
                      <Link
                        href={`/customers/${customer.customer_num}`}
                        className="font-medium text-[#185FA5] hover:text-[#144f8a] hover:underline"
                      >
                        {customer.customer_name}
                      </Link>
                      {customer.town && (
                        <p className="text-xs text-slate-500">{customer.town}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <dl className="mt-4 grid gap-3 theme-panel rounded-xl border p-5 text-sm shadow-sm sm:grid-cols-3">
            <DetailRow label="Markup price" value={`KES ${Number(route.route_markup_price ?? 0).toLocaleString()}`} />
            <DetailRow label="Region" value={route.direction || "—"} />
            <DetailRow label="Route ID" value={`#${route.id}`} />
          </dl>
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 sm:block">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 sm:mt-0.5">{value}</dd>
    </div>
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
