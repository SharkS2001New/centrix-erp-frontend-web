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
import { formatRouteKes } from "@/components/routes/route-form";
import {
  Field,
  StatCard,
  formatShortDate,
  getSaleTimestamp,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { parsePaginator } from "@/lib/paginated-api";

export function FulfillmentRoutesIdScreen() {
  const params = useParams();
  const { capabilities } = useAuth();
  const routeId = Number(params.id);

  const [route, setRoute] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [sales, setSales] = useState([]);
  const [salesStats, setSalesStats] = useState({ total: 0, count: 0 });
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
            searchParams: {
              per_page: 25,
              "filter[route_id]": routeId,
              sort: "customer_name",
              sort_dir: "asc",
            },
          }),
        ]);
        if (cancelled) return;
        setRoute(routeData);
        const parsed = parsePaginator(custRes);
        setCustomers(parsed.items.filter((c) => !c.deleted_at));
        setCustomerTotal(parsed.total);
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
      const [listRes, statsRoute] = await Promise.all([
        apiRequest("/sales", {
          searchParams: {
            per_page: 8,
            with_items: 0,
            route_orders: 1,
            route_id: routeId,
            exclude_statuses: "cancelled,expired,held",
            from_date: fromDate,
            to_date: toDate,
            date_field: "placed",
            sort: "placed_at",
            sort_dir: "desc",
          },
        }),
        apiRequest("/routes", {
          searchParams: {
            per_page: 1,
            "filter[id]": routeId,
            include_stats: 1,
            stats_from_date: fromDate,
            stats_to_date: toDate,
          },
        }).catch(() => null),
      ]);
      const parsed = parsePaginator(listRes);
      setSales(parsed.items);
      const statsRow = (statsRoute?.data ?? []).find((r) => Number(r.id) === Number(routeId));
      if (statsRow) {
        setSalesStats({
          total: Number(statsRow.sales_total ?? 0),
          count: Number(statsRow.orders_count ?? parsed.total ?? 0),
        });
      } else {
        setSalesStats({
          total: parsed.items.reduce((sum, sale) => sum + Number(sale.order_total ?? 0), 0),
          count: parsed.total,
        });
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load route sales");
    }
  }, [routeId, fromDate, toDate]);

  useTabAwareDataLoad(loadSales);

  const periodLabel = formatCompactDateRange(fromDate, toDate);
  const isActive = useMemo(() => route && route.is_active !== false, [route]);

  return (
    <div className="theme-workspace min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <AppBreadcrumb
          items={[
            { label: "Fulfillment", href: "/fulfillment" },
            { label: "Routes", href: "/fulfillment/routes" },
            { label: route?.route_name ?? `Route #${routeId}` },
          ]}
        />

        {loading && !route ? (
          <p className="mt-8 text-sm text-slate-500">Loading route…</p>
        ) : !route ? (
          <p className="mt-8 text-sm text-slate-500">Route not found.</p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {route.route_name}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {[route.route_code, route.area].filter(Boolean).join(" · ") || "Route detail"}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
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
              <StatCard label="Customers" value={String(customerTotal)} />
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
                    Recent active route orders ({routeOrderSourcesText(capabilities).toLowerCase()})
                  </p>
                </div>
                {sales.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-slate-500">
                    No sales in this period.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {sales.map((sale) => (
                      <li
                        key={sale.id ?? sale.order_num}
                        className="flex items-center justify-between gap-4 px-5 py-3.5"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            Order #{formatOrderNumber(sale)}
                          </p>
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
                    Showing {customers.length} of {customerTotal} assigned customers
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
                        <p className="text-xs text-slate-500">
                          #{customer.customer_num}
                          {customer.phone_number ? ` · ${customer.phone_number}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
