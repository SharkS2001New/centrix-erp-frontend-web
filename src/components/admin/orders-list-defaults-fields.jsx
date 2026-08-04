"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  ORDER_LIST_COLUMN_OPTIONS,
  ORDER_LIST_COLUMN_QUEUE_OPTIONS,
  ORDERS_LIST_SORT_OPTIONS,
  normalizeOrdersListVisibleColumns,
  normalizeOrdersListVisibleColumnsByQueue,
} from "@/lib/sales-settings";

export function OrdersListDefaultsFields({ value, onChange, idPrefix = "orders-list" }) {
  const days = value?.orders_list_default_days ?? "14";
  const searchDays = value?.orders_list_search_days ?? "30";
  const sort = value?.orders_list_sort ?? "-created_at";
  const visibleColumns = normalizeOrdersListVisibleColumns(value?.orders_list_visible_columns);
  const queueColumns = normalizeOrdersListVisibleColumnsByQueue(
    value?.orders_list_visible_columns_by_queue,
  );

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
          Fallback when search is used without From/To dates (default 30 / 1 month). When staff set
          date filters on Sales → Orders, search stays inside those filters. Must be at least as
          wide as the default date filter.
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
      <Field label="Columns shown by default">
        <div className="mt-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
          <p className="mb-3 text-xs text-slate-500">
            These are the columns staff see first in Sales → Orders. Hidden columns still appear in
            the `Columns` picker so each user can turn them on when needed.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ORDER_LIST_COLUMN_OPTIONS.map((column) => {
              const checked = visibleColumns.includes(column.id);
              return (
                <label
                  key={column.id}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                    column.required
                      ? "cursor-not-allowed text-slate-500"
                      : "cursor-pointer text-slate-700 hover:bg-white/70"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={checked}
                    disabled={column.required}
                    onChange={() => {
                      const next = checked
                        ? visibleColumns.filter((id) => id !== column.id)
                        : [...visibleColumns, column.id];
                      patch({ orders_list_visible_columns: normalizeOrdersListVisibleColumns(next) });
                    }}
                  />
                  <span>
                    {column.label}
                    {column.required ? " (always shown)" : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </Field>
      <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600">Queue-specific column defaults</p>
        <p className="text-xs text-slate-500">
          Optional overrides for specific Orders views like `Unpaid`, `Paid`, or `Mobile`. When a
          queue is not configured here, it uses the Default / View all columns above.
        </p>
        {ORDER_LIST_COLUMN_QUEUE_OPTIONS.filter((queue) => queue.id !== "all").map((queue) => {
          const queueVisible = queueColumns[queue.id] ?? visibleColumns;
          return (
            <Field key={queue.id} label={queue.label}>
              <div className="mt-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Staff can still turn extra columns on from the `Columns` menu for this view.
                  </p>
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-600 hover:text-blue-500"
                    onClick={() => {
                      const next = { ...queueColumns };
                      delete next[queue.id];
                      patch({ orders_list_visible_columns_by_queue: next });
                    }}
                  >
                    Use default
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ORDER_LIST_COLUMN_OPTIONS.map((column) => {
                    const checked = queueVisible.includes(column.id);
                    return (
                      <label
                        key={column.id}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                          column.required
                            ? "cursor-not-allowed text-slate-500"
                            : "cursor-pointer text-slate-700 hover:bg-white/70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={checked}
                          disabled={column.required}
                          onChange={() => {
                            const nextColumns = checked
                              ? queueVisible.filter((id) => id !== column.id)
                              : [...queueVisible, column.id];
                            patch({
                              orders_list_visible_columns_by_queue: {
                                ...queueColumns,
                                [queue.id]: normalizeOrdersListVisibleColumns(nextColumns),
                              },
                            });
                          }}
                        />
                        <span>
                          {column.label}
                          {column.required ? " (always shown)" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </Field>
          );
        })}
      </div>
    </div>
  );
}
