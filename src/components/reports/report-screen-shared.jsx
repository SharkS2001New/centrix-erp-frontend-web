"use client";

import { Fragment } from "react";
import Link from "next/link";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  StatCard,
  Field,
  PrimaryButton,
  inputClassName,
  FILTER_BAR_CLASS,
  EMPTY_STATE_CLASS,
  FILTER_RESET_BTN_CLASS,
  TABLE_SHELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_BODY_ROW_CLASS,
  TABLE_FOOTER_ROW_CLASS,
} from "@/components/catalog/catalog-shared";
import { formatReportCell } from "@/lib/reports/format";
import { REPORT_EXTRA_FILTERS } from "@/lib/reports/report-filter-config";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { ReportQueryFilterFieldsStructured } from "@/components/reports/report-query-filter-fields";
import { ReportBranchSearchSelect } from "@/components/reports/report-filter-search-select";
import { ReportCellLink } from "@/components/reports/report-cell-link";

const BADGE_TONES = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  danger: "bg-red-50 text-red-700 ring-red-600/20",
  primary: "bg-blue-50 text-blue-700 ring-blue-600/20",
  neutral: "theme-badge-neutral",
};

export function ReportBadge({ label, tone = "neutral" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone] ?? BADGE_TONES.neutral}`}
    >
      {label}
    </span>
  );
}

export function ReportKpiGrid({ items }) {
  if (!items?.length) return null;
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <StatCard
          key={item.id ?? item.label ?? index}
          label={item.label}
          value={item.value}
          hint={item.hint}
        />
      ))}
    </div>
  );
}

export function ReportFilterBar({
  fromDate,
  toDate,
  branchId,
  branches,
  showDateRange = true,
  reportKey,
  queryFilterValues = {},
  queryFilterOptions = {},
  onQueryFilterChange,
  extraFilters = [],
  extraValues = {},
  onFromDateChange,
  onToDateChange,
  onBranchChange,
  onExtraChange,
  onFilter,
  onReset,
  loading = false,
  showBranchFilter = true,
}) {
  const hasQueryFilters = Boolean(
    reportKey && onQueryFilterChange && (REPORT_EXTRA_FILTERS[reportKey]?.length ?? 0) > 0,
  );
  const hasExtraFilters = (extraFilters ?? []).length > 0;
  const hasAnyFilterControl = showDateRange || showBranchFilter || hasQueryFilters || hasExtraFilters;

  if (!hasAnyFilterControl) {
    return null;
  }

  return (
    <div className={`mb-6 ${FILTER_BAR_CLASS}`}>
      <div className="flex flex-wrap items-end gap-3">
        {showDateRange ? (
          <>
            <Field label="From date">
              <input
                type="date"
                className={inputClassName()}
                value={fromDate}
                onChange={(e) => onFromDateChange(e.target.value)}
              />
            </Field>
            <Field label="To date">
              <input
                type="date"
                className={inputClassName()}
                value={toDate}
                onChange={(e) => onToDateChange(e.target.value)}
              />
            </Field>
          </>
        ) : null}
        {showBranchFilter ? (
          <Field label="Branch">
            <ReportBranchSearchSelect
              value={branchId}
              onChange={onBranchChange}
              branches={branches}
              controlClassName={inputClassName()}
            />
          </Field>
        ) : null}
        {reportKey && onQueryFilterChange ? (
          <ReportQueryFilterFieldsStructured
            reportKey={reportKey}
            values={queryFilterValues}
            onChange={onQueryFilterChange}
            optionsByKey={queryFilterOptions}
          />
        ) : null}
        {extraFilters.map((filter) =>
          filter.type === "checkbox" ? (
            <label key={filter.id} className="flex cursor-pointer items-center gap-2 pb-2 text-sm theme-text-muted">
              <input
                type="checkbox"
                checked={Boolean(extraValues[filter.id])}
                onChange={(e) => onExtraChange(filter.id, e.target.checked)}
              />
              {filter.label}
            </label>
          ) : null,
        )}
        <div className="flex gap-2 pb-0.5">
          <PrimaryButton type="button" showIcon={false} disabled={loading} onClick={onFilter}>
            {loading ? "Loading…" : "Filter"}
          </PrimaryButton>
          <button type="button" onClick={onReset} className={FILTER_RESET_BTN_CLASS}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function groupReportRows(rows, groupBy) {
  if (!groupBy?.key || !rows?.length) return null;

  const order = [];
  const map = new Map();
  for (const row of rows) {
    const id = row[groupBy.key] ?? `__${groupBy.title?.(row) ?? row.supplier_name ?? ""}`;
    if (!map.has(id)) {
      map.set(id, { id, sample: row, rows: [] });
      order.push(id);
    }
    map.get(id).rows.push(row);
  }
  return order.map((id) => map.get(id));
}

function renderReportDataCells(columns, row) {
  return columns.map((col) => {
    const badge = col.badge?.(row);
    const raw = col.accessor(row);
    return (
      <td
        key={col.key}
        className={`whitespace-nowrap px-4 py-2.5 theme-text-muted ${col.align === "right" ? "text-right" : "text-left"}`}
      >
        {badge ? (
          <ReportBadge label={badge.label} tone={badge.tone} />
        ) : (
          <ReportCellLink columnKey={col.key} row={row} value={raw} link={col.link} />
        )}
      </td>
    );
  });
}

export function ReportTable({
  columns,
  rows,
  footerTotals = {},
  groupBy = null,
  emptyLabel = "No rows for this filter.",
}) {
  if (!rows.length) {
    return <div className={EMPTY_STATE_CLASS}>{emptyLabel}</div>;
  }

  const sections = groupReportRows(rows, groupBy);

  return (
    <div className={TABLE_SHELL_CLASS}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className={`${TABLE_HEAD_ROW_CLASS} font-semibold`}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`whitespace-nowrap px-4 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections
              ? sections.map((section) => {
                  const title =
                    (typeof groupBy.title === "function"
                      ? groupBy.title(section.sample)
                      : section.sample?.[groupBy.titleKey]) || "—";
                  const subtitle =
                    typeof groupBy.subtitle === "function"
                      ? groupBy.subtitle(section.sample)
                      : groupBy.subtitleKey
                        ? section.sample?.[groupBy.subtitleKey]
                        : null;
                  const subtotalKeys = groupBy.subtotalKeys ?? [];
                  const subtotals = {};
                  for (const key of subtotalKeys) {
                    const col = columns.find((c) => c.key === key);
                    const total = section.rows.reduce(
                      (acc, row) => acc + (Number(row[key]) || 0),
                      0,
                    );
                    subtotals[key] = formatReportCell(key, total, undefined, section.sample);
                    if (col?.footerCompute) {
                      subtotals[key] = formatReportCell(
                        key,
                        col.footerCompute(section.rows),
                        undefined,
                        section.sample,
                      );
                    }
                  }

                  return (
                    <Fragment key={section.id}>
                      <tr className="border-b border-slate-200 bg-slate-50/90">
                        <td colSpan={columns.length} className="px-4 py-2.5">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="text-sm font-semibold theme-heading">
                              {groupBy.link ? (
                                <ReportCellLink
                                  columnKey={groupBy.titleColumnKey ?? groupBy.key}
                                  row={section.sample}
                                  value={title}
                                  link={groupBy.link}
                                />
                              ) : (
                                title
                              )}
                            </span>
                            {subtitle ? (
                              <span className="font-mono text-xs theme-subtext">{subtitle}</span>
                            ) : null}
                            <span className="text-xs theme-subtext">
                              {section.rows.length} line{section.rows.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {section.rows.map((row, idx) => (
                        <tr
                          key={row.id ?? `${section.id}-${idx}`}
                          className={`${TABLE_BODY_ROW_CLASS} ${row.legacy_archive ? "theme-legacy-archive-row" : ""}`}
                        >
                          {renderReportDataCells(columns, row)}
                        </tr>
                      ))}
                      {subtotalKeys.length ? (
                        <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-medium theme-text-muted">
                          {columns.map((col, idx) => (
                            <td
                              key={col.key}
                              className={`whitespace-nowrap px-4 py-2 ${col.align === "right" ? "text-right" : "text-left"}`}
                            >
                              {idx === 0
                                ? (groupBy.subtotalLabel ?? "Group total")
                                : subtotals[col.key] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              : rows.map((row, idx) => (
                  <tr
                    key={row.id ?? idx}
                    className={`${TABLE_BODY_ROW_CLASS} ${row.legacy_archive ? "theme-legacy-archive-row" : ""}`}
                  >
                    {renderReportDataCells(columns, row)}
                  </tr>
                ))}
          </tbody>
          {Object.keys(footerTotals).length ? (
            <tfoot>
              <tr className={TABLE_FOOTER_ROW_CLASS}>
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {idx === 0 ? "Totals" : footerTotals[col.key] ?? ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

export function ReportPageShell({
  section,
  title,
  subtitle,
  exportConfig,
  printAction = null,
  onExport,
  children,
}) {
  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "Reports", href: "/reports" },
          ...(section ? [{ label: section, href: "/reports" }] : []),
          { label: title },
        ]}
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold theme-heading">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm theme-subtext">{subtitle}</p> : null}
        </div>
        {exportConfig || printAction ? (
          <div className="flex flex-wrap items-center gap-2">
            {printAction ? (
              <button
                type="button"
                disabled={printAction.disabled}
                onClick={printAction.onClick}
                className={`${FILTER_RESET_BTN_CLASS} shadow-sm disabled:opacity-50`}
              >
                {printAction.label ?? "Print"}
              </button>
            ) : null}
            {exportConfig ? (
          <ReportExportToolbar
            filename={exportConfig.filename}
            title={title}
            subtitle={subtitle ?? exportConfig.subtitle}
            columns={exportConfig.columns}
            getRows={exportConfig.getRows}
            exportSource={exportConfig.exportSource}
            meta={exportConfig.meta}
            footerRow={exportConfig.footerRow}
            estimatedRowCount={exportConfig.estimatedRowCount}
            disabled={exportConfig.disabled}
          />
            ) : null}
          </div>
        ) : onExport ? (
          <button type="button" onClick={onExport} className={`${FILTER_RESET_BTN_CLASS} shadow-sm`}>
            Export CSV
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function ReportBackLink() {
  return (
    <Link href="/reports" className="mb-4 inline-block text-sm font-medium text-[#185FA5] hover:underline">
      ← All reports
    </Link>
  );
}
