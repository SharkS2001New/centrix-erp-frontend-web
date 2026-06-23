"use client";

import {
  Field,
  getSaleTimestamp,
  inputClassName,
  isInCalendarWeek,
  isSameCalendarDay,
  isSameCalendarMonth,
} from "@/components/catalog/catalog-shared";

export const EMPTY_ROUTE_FORM = {
  route_name: "",
  direction: "",
  route_markup_price: "0",
  is_active: true,
};

export function routeToForm(route) {
  return {
    route_name: route.route_name ?? "",
    direction: route.direction ?? "",
    route_markup_price:
      route.route_markup_price != null ? String(route.route_markup_price) : "0",
    is_active: route.is_active !== false,
  };
}

export function buildRouteBody(form) {
  return {
    route_name: form.route_name.trim(),
    direction: form.direction.trim() || null,
    route_markup_price: parseInt(form.route_markup_price, 10) || 0,
    is_active: form.is_active,
  };
}

export function updateRouteFormField(form, key, value) {
  return { ...form, [key]: value };
}

export function RouteFormFields({ form, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
      <div className="md:col-span-2">
        <Field label="Route name">
          <input
            type="text"
            value={form.route_name}
            onChange={(e) => onChange("route_name", e.target.value)}
            required
            className={inputClassName()}
            placeholder="CBD Route"
          />
        </Field>
      </div>

      <Field label="Region">
        <input
          type="text"
          value={form.direction}
          onChange={(e) => onChange("direction", e.target.value)}
          className={inputClassName()}
          placeholder="Nairobi CBD"
        />
      </Field>

      <Field label="Markup price (KES)">
        <input
          type="number"
          value={form.route_markup_price}
          onChange={(e) => onChange("route_markup_price", e.target.value)}
          min="0"
          className={inputClassName()}
        />
      </Field>

      <div className="md:col-span-2">
        <span className="mb-2 block text-xs font-medium text-slate-500">Status</span>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="route_status"
              checked={form.is_active}
              onChange={() => onChange("is_active", true)}
              className="border-slate-300 text-[#185FA5] focus:ring-[#185FA5]"
            />
            Active
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="route_status"
              checked={!form.is_active}
              onChange={() => onChange("is_active", false)}
              className="border-slate-300 text-[#185FA5] focus:ring-[#185FA5]"
            />
            Inactive
          </label>
        </div>
      </div>
    </div>
  );
}

export function RouteFormCard({ children, onSubmit, actions }) {
  return (
    <form
      onSubmit={onSubmit}
      className="max-w-4xl theme-panel rounded-xl border p-6 shadow-sm"
    >
      {children}
      {actions}
    </form>
  );
}

export function countCustomersByRoute(customers) {
  const map = new Map();
  for (const c of customers) {
    if (c.route_id != null && !c.deleted_at) {
      map.set(c.route_id, (map.get(c.route_id) ?? 0) + 1);
    }
  }
  return map;
}

export function isToday(value) {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function countTodayDeliveries(sales, routeId) {
  return sales.filter(
    (s) =>
      s.route_id === routeId &&
      !s.deleted_at &&
      s.status === "completed" &&
      (isToday(s.delivery_date) || isToday(s.completed_at) || isToday(s.created_at)),
  ).length;
}

export function isCompletedRouteSale(sale) {
  return sale?.route_id != null && !sale.deleted_at && sale.status === "completed";
}

export function isSaleInPeriod(sale, period, reference = new Date()) {
  const ts = getSaleTimestamp(sale);
  if (!ts) return false;
  if (period === "day") return isSameCalendarDay(ts, reference);
  if (period === "week") return isInCalendarWeek(ts, reference);
  if (period === "month") return isSameCalendarMonth(ts, reference);
  return true;
}

/** @returns {Map<number, { total: number, count: number }>} */
export function aggregateSalesByRoute(sales, period = "day") {
  const map = new Map();
  for (const sale of sales) {
    if (!isCompletedRouteSale(sale) || !isSaleInPeriod(sale, period)) continue;
    const cur = map.get(sale.route_id) ?? { total: 0, count: 0 };
    cur.total += Number(sale.order_total ?? 0);
    cur.count += 1;
    map.set(sale.route_id, cur);
  }
  return map;
}

export function sumRouteSales(map) {
  let total = 0;
  let count = 0;
  for (const { total: t, count: c } of map.values()) {
    total += t;
    count += c;
  }
  return { total, count };
}

export function formatRouteKes(value) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}
