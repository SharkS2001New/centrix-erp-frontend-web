"use client";

import Link from "next/link";
import { StatCard } from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";

const SHORTCUT_LINK_CLASS =
  "inline-flex items-center rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50";

const ROUTE_ORDERS_SHORTCUTS = [
  { href: "/fulfillment/dispatch", label: "Dispatch board", permission: P.fulfillment.dispatch.view },
  { href: "/fulfillment/trips", label: "Trips", permission: P.fulfillment.trips.view },
  { href: "/fulfillment/loading-lists", label: "Loading lists", permission: P.fulfillment.loading_lists.view },
  { href: "/fulfillment/picking", label: "Warehouse picking", permission: P.fulfillment.picking.view },
  { href: "/fulfillment/routes", label: "Routes", permission: P.fulfillment.routes.view },
];

/**
 * Distribution shortcut strip for Route orders (ops chrome).
 * @param {{ hasPermission?: (code: string) => boolean }} props
 */
export function RouteOrdersOpsShortcuts({ hasPermission }) {
  const links = ROUTE_ORDERS_SHORTCUTS.filter(
    (item) => !item.permission || hasPermission?.(item.permission),
  );
  if (links.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-sky-200/70 bg-gradient-to-r from-sky-50/90 via-white to-slate-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
            Distribution
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            Orders assigned to delivery routes — open dispatch and loading tools from here.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Distribution shortcuts">
          {links.map((item) => (
            <Link key={item.href} href={item.href} className={SHORTCUT_LINK_CLASS}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

/**
 * Route-focused KPI cards (not sales Revenue-first).
 * @param {object} props
 * @param {{ total?: number, unpaid?: number, partial?: number, paid?: number }} props.summary
 * @param {string} [props.hint]
 * @param {object[]} [props.rows]
 * @param {string} [props.routeFilter]
 * @param {Map<any, any>} [props.routeById]
 */
export function RouteOrdersSummaryStats({
  summary,
  hint = "Filtered period",
  rows = [],
  routeFilter = "all",
  routeById,
}) {
  const unpaid = Number(summary?.unpaid ?? 0);
  const partial = Number(summary?.partial ?? 0);
  const paid = Number(summary?.paid ?? 0);
  const total = Number(summary?.total ?? 0);

  let routesValue = "—";
  let routesHint = hint;
  if (routeFilter && routeFilter !== "all") {
    const route = routeById?.get?.(Number(routeFilter)) ?? routeById?.get?.(routeFilter);
    routesValue = "1";
    routesHint = route?.route_name || `Route #${routeFilter}`;
  } else {
    const ids = new Set();
    for (const sale of rows) {
      if (sale?.route_id != null && sale.route_id !== "") {
        ids.add(String(sale.route_id));
      }
    }
    routesValue = String(ids.size);
    routesHint = ids.size === 1 ? "1 route on this page" : `${ids.size} routes on this page`;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Orders on routes" value={String(total)} hint={hint} />
      <StatCard label="Routes" value={routesValue} hint={routesHint} />
      <StatCard
        label="Collections due"
        value={String(unpaid + partial)}
        hint={`${unpaid} unpaid · ${partial} partial`}
      />
      <StatCard label="Paid" value={String(paid)} hint={hint} />
    </div>
  );
}

/**
 * Eyebrow above the route-orders table so the list body reads as Distribution.
 * @param {{ routeFilter?: string, routeById?: Map<any, any> }} props
 */
export function RouteOrdersListEyebrow({ routeFilter = "all", routeById }) {
  let detail = "Assigned to a delivery route";
  if (routeFilter && routeFilter !== "all") {
    const route = routeById?.get?.(Number(routeFilter)) ?? routeById?.get?.(routeFilter);
    detail = route?.route_name
      ? `Filtered to ${route.route_name}`
      : `Filtered to route #${routeFilter}`;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50/60 px-4 py-2.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
          On delivery routes
        </p>
        <p className="text-xs text-slate-600">{detail}</p>
      </div>
      <p className="text-xs text-slate-500">View only · change status in Sales → Orders</p>
    </div>
  );
}
