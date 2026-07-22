"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { routeOrderSourcesText } from "@/lib/distribution-settings";
import { formatOrderNumber } from "@/lib/sales";
import { defaultDateRange, formatCompactDateRange } from "@/lib/datetime";
import {
  effectiveSaleRouteId,
  formatRouteKes,
  isActiveRouteSale,
  normalizeRouteId,
} from "@/components/routes/route-form";
import {
  Field,
  StatCard,
  formatShortDate,
  getSaleTimestamp,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";

export function FulfillmentRoutesIdScreen() {
  const params = useParams();
  const { capabilities } = useAuth();
  const routeId = Number(params.id);

  const [route, setRoute] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const defaultRange = useMemo(() => defaultDateRange(7), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [routeData, custRes] = await Promise.all([
          apiRequest(`/routes/${routeId}`),
          apiRequest("/customers", {
            searchParams: { per_page: 200, "filter[route_id]": routeId },
          }),
        ]);
        if (cancelled) return;
        setRoute(routeData);
        setCustomers((custRes.data ?? []).filter((c) => !c.deleted_at));
      } catch (e) {
        if (!cancelled) {
          notifyError(e instanceof Error ? e.message : "Failed to load route");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const loadSales = useCallback(async () => {
    try {
      const salesRes = await apiRequest("/sales", {
        searchParams: {
          per_page: 200,
          with_items: 0,
          route_orders: 1,
          route_id: routeId,
          exclude_statuses: "cancelled,expired,held",
          from_date: fromDate,
          to_date: toDate,
          date_field: "placed",
        },
      });
      setSales(salesRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load route sales");
    }
  }, [routeId, fromDate, toDate]);

  useTabAwareDataLoad(loadSales);

  const salesStats = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const sale of sales) {
      if (!isActiveRouteSale(sale)) continue;
      if (normalizeRouteId(effectiveSaleRouteId(sale)) !== normalizeRouteId(routeId)) continue;
      total += Number(sale.order_total ?? 0);
      count += 1;
    }
    return { total, count };
  }, [sales, routeId]);

  const recentSales = useMemo(
    () =>
      sales
        .filter((s) => isActiveRouteSale(s))
        .sort((a, b) => {
          const ta = getSaleTimestamp(a)?.getTime() ?? 0;
          const tb = getSaleTimestamp(b)?.getTime() ?? 0;
          return tb - ta;
        })
        .slice(0, 8),
    [sales],
  );

  const periodLabel = formatCompactDateRange(fromDate, toDate);

  const isActive = useMemo(() => route && route.is_active !== false, [route]);

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Distribution", href: "/fulfillment" },
          { label: "Routes", href: "/fulfillment/routes" },
          { label: route?.route_name ?? "Route" },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-slate-900">Route details</h1>
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
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From">
                <input
                  type="date"
                  className={inputClassName()}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={inputClassName()}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </Field>
            </div>
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
                  Active route orders in this period ({routeOrderSourcesText(capabilities).toLowerCase()})
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
