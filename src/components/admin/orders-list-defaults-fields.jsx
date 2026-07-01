"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { ORDERS_LIST_SORT_OPTIONS } from "@/lib/sales-settings";

export function OrdersListDefaultsFields({ value, onChange, idPrefix = "orders-list" }) {
  const days = value?.orders_list_default_days ?? "5";
  const sort = value?.orders_list_sort ?? "-created_at";

  function patch(partial) {
    onChange?.({ ...value, ...partial });
  }

  return (
    <div className="space-y-3">
      <Field label="Default date range (days)">
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
          How many calendar days of orders to show when staff open Sales → Orders (including today). Staff can
          still narrow or widen the range with the date filters.
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
