"use client";

import {
  Field,
  getSaleTimestamp,
  inputClassName,
  isInCalendarWeek,
  isSameCalendarDay,
  isSameCalendarMonth,
} from "@/components/catalog/catalog-shared";
import { ReceiptPaymentDetailsEditor } from "@/components/admin/receipt-payment-details-editor";
import { receiptPaymentDetailsFromApi } from "@/lib/receipt-payment-details";

export const EMPTY_ROUTE_FORM = {
  route_name: "",
  direction: "",
  route_markup_price: "0",
  is_active: true,
  receipt_payment_details: null,
  use_route_payment_details: false,
};

export function routeToForm(route) {
  const details = route.receipt_payment_details
    ? receiptPaymentDetailsFromApi(route.receipt_payment_details)
    : null;
  return {
    route_name: route.route_name ?? "",
    direction: route.direction ?? "",
    route_markup_price:
      route.route_markup_price != null ? String(route.route_markup_price) : "0",
    is_active: route.is_active !== false,
    receipt_payment_details: details,
    use_route_payment_details: Boolean(details),
  };
}

export function buildRouteBody(form) {
  const body = {
    route_name: form.route_name.trim(),
    direction: form.direction.trim() || null,
    route_markup_price: parseInt(form.route_markup_price, 10) || 0,
    is_active: form.is_active,
  };

  if (form.use_route_payment_details && form.receipt_payment_details) {
    const lines = (form.receipt_payment_details.lines ?? []).filter(
      (line) => line.label?.trim() || line.value?.trim(),
    );
    const note = String(form.receipt_payment_details.note ?? "").trim();
    if (lines.length || note) {
      body.receipt_payment_details = {
        title: form.receipt_payment_details.title?.trim() || "Payment details",
        lines,
        note,
      };
    } else {
      body.receipt_payment_details = null;
    }
  } else {
    body.receipt_payment_details = null;
  }

  return body;
}

export function updateRouteFormField(form, key, value) {
  return { ...form, [key]: value };
}

export function RouteFormFields({ form, onChange, onPatch }) {
  function applyPatch(updates) {
    if (onPatch) {
      onPatch(updates);
      return;
    }
    Object.entries(updates).forEach(([key, value]) => onChange(key, value));
  }

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

      <div className="md:col-span-2">
        <label className="mb-2 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(form.use_route_payment_details)}
            onChange={(e) => {
              const checked = e.target.checked;
              const updates = { use_route_payment_details: checked };
              if (checked && !form.receipt_payment_details) {
                updates.receipt_payment_details = {
                  title: "Payment details",
                  lines: [
                    { label: "M-Pesa Paybill", value: "" },
                    { label: "Account no.", value: "" },
                  ],
                  note: "",
                };
              }
              applyPatch(updates);
            }}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              Custom payment instructions for this route
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Overrides organization mobile/route receipt paybill details for orders on this route
              (mobile field sales and POS route orders).
            </span>
          </span>
        </label>
        {form.use_route_payment_details ? (
          <div className="mt-3">
            <ReceiptPaymentDetailsEditor
              value={form.receipt_payment_details}
              onChange={(value) => onChange("receipt_payment_details", value)}
              idPrefix={`route-${form.route_name || "new"}`}
            />
          </div>
        ) : null}
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
    const routeId = normalizeRouteId(c.route_id);
    if (routeId != null && !c.deleted_at) {
      map.set(routeId, (map.get(routeId) ?? 0) + 1);
    }
  }
  return map;
}

export function normalizeRouteId(routeId) {
  if (routeId == null || routeId === "") return null;
  const num = Number(routeId);
  return Number.isFinite(num) ? num : null;
}

export function effectiveSaleRouteId(sale) {
  return normalizeRouteId(sale?.route_id) ?? normalizeRouteId(sale?.customer?.route_id);
}

const ROUTE_SALE_EXCLUDED_STATUSES = new Set(["cancelled", "expired", "held"]);

export function isActiveRouteSale(sale) {
  return (
    effectiveSaleRouteId(sale) != null &&
    !sale?.deleted_at &&
    !ROUTE_SALE_EXCLUDED_STATUSES.has(String(sale?.status ?? "").toLowerCase())
  );
}

export function isCompletedRouteSale(sale) {
  return isActiveRouteSale(sale) && sale.status === "completed";
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
  const normalizedRouteId = normalizeRouteId(routeId);
  return sales.filter(
    (s) =>
      effectiveSaleRouteId(s) === normalizedRouteId &&
      !s.deleted_at &&
      s.status === "completed" &&
      (isToday(s.delivery_date) || isToday(s.completed_at) || isToday(s.created_at)),
  ).length;
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
    const routeId = effectiveSaleRouteId(sale);
    if (!isActiveRouteSale(sale) || !isSaleInPeriod(sale, period) || routeId == null) continue;
    const cur = map.get(routeId) ?? { total: 0, count: 0 };
    cur.total += Number(sale.order_total ?? 0);
    cur.count += 1;
    map.set(routeId, cur);
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
