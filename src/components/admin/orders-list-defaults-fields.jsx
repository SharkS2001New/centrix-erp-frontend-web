"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { ORDERS_LIST_SORT_OPTIONS } from "@/lib/sales-settings";

export function OrdersListDefaultsFields({ value, onChange, idPrefix = "orders-list" }) {
  const days = value?.orders_list_default_days ?? "14";
  const searchDays = value?.orders_list_search_days ?? "30";
  const sort = value?.orders_list_sort ?? "-created_at";

  function patch(partial) {
    onChange?.({ ...value, ...partial });
  }

  return (
    <div className="space-y-3">
      <Field label="Default date filter (days)">
        <input
          id={`${idPrefix}-days`}
          type="number"
          min={1}
          max={90}
          className={`${inputClassName()} w-32`}
          value={days}
          onChange={(e) => patch({ orders_list_default_days: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">
          How many calendar days of orders to show when staff open Sales → Orders (including today).
          Default for wholesale/retail is 14 (2 weeks). Distribution orgs often use 30+. Staff can
          still narrow or widen the range with the date filters.
        </p>
      </Field>
      <Field label="Search window (days)">
        <input
          id={`${idPrefix}-search-days`}
          type="number"
          min={1}
          max={90}
          className={`${inputClassName()} w-32`}
          value={searchDays}
          onChange={(e) => patch({ orders_list_search_days: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">
          When staff search by order number or customer, expand the date scope to this many days
          (default 30 / 1 month). Must be at least as wide as the default date filter. Distribution
          setups typically need a wider window than wholesale/retail.
        </p>
      </Field>
      <Field label="Default sort order">
        <select
          id={`${idPrefix}-sort`}
          className={inputClassName()}
          value={sort}
          onChange={(e) => patch({ orders_list_sort: e.target.value })}
        >
          {ORDERS_LIST_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
