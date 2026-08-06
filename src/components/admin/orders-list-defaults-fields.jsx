"use client";

import { useMemo, useState } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import {
  ORDER_LIST_COLUMN_OPTIONS,
  ORDERS_LIST_SORT_OPTIONS,
  normalizeOrdersListVisibleColumns,
  normalizeOrdersListVisibleColumnsByQueue,
  normalizeReportsDefaultDateRangeDays,
} from "@/lib/sales-settings";
import { orderListColumnQueueOptionsForWorkflow } from "@/lib/order-workflow";

const ORDERS_LIST_SUB_TABS = [
  { id: "defaults", label: "List defaults" },
  { id: "columns", label: "Columns" },
];

function ColumnCheckboxGrid({ columns, visibleColumns, onToggle }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {columns.map((column) => {
        const checked = visibleColumns.includes(column.id);
        return (
          <label
            key={column.id}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-white/70"
          >
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={checked}
              onChange={() => onToggle(column.id, checked)}
            />
            <span>{column.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function OrdersListDefaultsFields({
  value,
  onChange,
  idPrefix = "orders-list",
  workflow = null,
  includeMobile = null,
  includeWhatsapp = null,
}) {
  const [activeTab, setActiveTab] = useState("defaults");
  useSettingsSubTab(activeTab, setActiveTab, ORDERS_LIST_SUB_TABS);

  const days = value?.orders_list_default_days ?? "14";
  const reportsDays = String(
    normalizeReportsDefaultDateRangeDays(value?.reports_default_date_range_days ?? 30),
  );
  const searchDays = value?.orders_list_search_days ?? "30";
  const sort = value?.orders_list_sort ?? "-created_at";
  const visibleColumns = normalizeOrdersListVisibleColumns(value?.orders_list_visible_columns);
  const queueColumns = normalizeOrdersListVisibleColumnsByQueue(
    value?.orders_list_visible_columns_by_queue,
  );

  const queueOptions = useMemo(
    () =>
      orderListColumnQueueOptionsForWorkflow(workflow ?? value?.order_workflow, {
        includeMobile:
          includeMobile != null ? includeMobile : value?.enable_mobile_orders !== false,
        includeWhatsapp:
          includeWhatsapp != null ? includeWhatsapp : Boolean(value?.enable_whatsapp_orders),
      }),
    [
      workflow,
      value?.order_workflow,
      includeMobile,
      includeWhatsapp,
      value?.enable_mobile_orders,
      value?.enable_whatsapp_orders,
    ],
  );

  function patch(partial) {
    onChange?.({ ...value, ...partial });
  }

  function toggleDefaultColumn(columnId, currentlyChecked) {
    const next = currentlyChecked
      ? visibleColumns.filter((id) => id !== columnId)
      : [...visibleColumns, columnId];
    // Keep at least one column so the orders table remains usable.
    if (next.length === 0) return;
    patch({ orders_list_visible_columns: normalizeOrdersListVisibleColumns(next) });
  }

  function toggleQueueColumn(queueId, queueVisible, columnId, currentlyChecked) {
    const nextColumns = currentlyChecked
      ? queueVisible.filter((id) => id !== columnId)
      : [...queueVisible, columnId];
    if (nextColumns.length === 0) return;
    patch({
      orders_list_visible_columns_by_queue: {
        ...queueColumns,
        [queueId]: normalizeOrdersListVisibleColumns(nextColumns),
      },
    });
  }

  return (
    <div className="space-y-4">
      <SettingsSubTabBar
        tabs={ORDERS_LIST_SUB_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="Orders list settings"
      />

      {activeTab === "defaults" ? (
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
          <Field label="Reports default date filter (days)">
            <input
              id={`${idPrefix}-reports-days`}
              type="number"
              min={1}
              max={90}
              className={`${inputClassName()} w-32`}
              value={reportsDays}
              onChange={(e) => patch({ reports_default_date_range_days: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Default From/To window for reports (KRA invoices, compliance, sales reports, and others),
              including today. Example: 2 = yesterday + today. Staff can still change the range on each
              report.
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
        </div>
      ) : null}

      {activeTab === "columns" ? (
        <div className="space-y-4">
          <Field label="Columns shown by default">
            <div className="mt-1 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3">
              <p className="mb-3 text-xs text-slate-500">
                These are the columns staff see first in Sales → Orders (View all). Hidden columns
                still appear in the `Columns` picker so each user can turn them on when needed.
              </p>
              <ColumnCheckboxGrid
                columns={ORDER_LIST_COLUMN_OPTIONS}
                visibleColumns={visibleColumns}
                onToggle={toggleDefaultColumn}
              />
            </div>
          </Field>

          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-600">Queue-specific column defaults</p>
            <p className="text-xs text-slate-500">
              Optional overrides for the Orders views enabled in this organization&apos;s workflow.
              Queues not listed here are not part of the current pipeline. When a queue has no
              override, it uses the Default / View all columns above.
            </p>
            {queueOptions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No workflow queues available yet. Configure Order workflow stages to add queue-specific
                column defaults.
              </p>
            ) : null}
            {queueOptions.map((queue) => {
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
                        className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-500"
                        onClick={() => {
                          const next = { ...queueColumns };
                          delete next[queue.id];
                          patch({ orders_list_visible_columns_by_queue: next });
                        }}
                      >
                        Use default
                      </button>
                    </div>
                    <ColumnCheckboxGrid
                      columns={ORDER_LIST_COLUMN_OPTIONS}
                      visibleColumns={queueVisible}
                      onToggle={(columnId, currentlyChecked) =>
                        toggleQueueColumn(queue.id, queueVisible, columnId, currentlyChecked)
                      }
                    />
                  </div>
                </Field>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
