"use client";

import Link from "next/link";
import { Field, StatCard, inputClassName } from "@/components/catalog/catalog-shared";
import { HubKpiCard } from "@/components/reports/report-charts";
import { formatReportKes } from "@/lib/reports/format";

export function DashboardErrorBanner({ message }) {
  if (!message) return null;
  return (
    <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </p>
  );
}

export function DashboardLoading({ label = "Loading dashboard…" }) {
  return <p className="theme-subtext text-sm">{label}</p>;
}

export function DashboardSection({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            {title ? <h2 className="theme-heading text-lg font-semibold">{title}</h2> : null}
            {subtitle ? <p className="theme-subtext mt-0.5 text-sm">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function DashboardPanel({ title, subtitle, children, className = "", headerAction = null }) {
  return (
    <div className={`theme-panel rounded-xl border p-5 shadow-sm ${className}`}>
      {(title || headerAction) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title ? <h3 className="theme-heading text-sm font-semibold">{title}</h3> : null}
            {subtitle ? <p className="theme-subtext mt-0.5 text-xs">{subtitle}</p> : null}
          </div>
          {headerAction}
        </div>
      )}
      {children}
    </div>
  );
}

export function DashboardKpiGrid({ items, variant = "stat" }) {
  if (!items?.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) =>
        variant === "hub" ? (
          <HubKpiCard
            key={item.id ?? item.label}
            label={item.label}
            value={item.value}
            changePct={item.changePct}
          />
        ) : (
          <StatCard
            key={item.id ?? item.label}
            label={item.label}
            value={item.value}
            hint={item.hint}
          />
        ),
      )}
    </div>
  );
}

export function DashboardDateRangeBar({
  fromDate,
  toDate,
  branchId,
  branches = [],
  onFromDateChange,
  onToDateChange,
  onBranchChange,
  showBranch = true,
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <Field label="From">
        <input
          type="date"
          className={inputClassName()}
          value={fromDate}
          onChange={(e) => onFromDateChange(e.target.value)}
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          className={inputClassName()}
          value={toDate}
          onChange={(e) => onToDateChange(e.target.value)}
        />
      </Field>
      {showBranch ? (
        <Field label="Branch">
          <select className={inputClassName()} value={branchId} onChange={(e) => onBranchChange(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branch_name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}

export function DashboardQuickLinks({ links }) {
  if (!links?.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="theme-panel group rounded-xl border p-4 shadow-sm transition hover:border-[var(--theme-primary)]/40 hover:shadow-md"
        >
          <p className="theme-heading text-sm font-medium group-hover:text-[var(--theme-primary)]">
            {link.title}
          </p>
          {link.desc ? <p className="theme-subtext mt-1 text-xs">{link.desc}</p> : null}
        </Link>
      ))}
    </div>
  );
}

export function DashboardSummaryTable({
  columns,
  rows,
  emptyMessage = "No data for this period.",
  viewAllHref,
  viewAllLabel = "View all →",
  formatValue,
}) {
  const format = formatValue ?? ((_, value) => (value == null || value === "" ? "—" : String(value)));

  return (
    <div className="theme-table-shell overflow-hidden">
      <div className="overflow-x-auto">
        <table className="theme-table w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="theme-table-head-row text-left text-xs font-medium uppercase tracking-wide">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-2.5 ${col.align === "right" ? "text-right" : "text-left"}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows?.length ? (
              <tr>
                <td colSpan={columns.length} className="theme-subtext px-4 py-8 text-center">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.id ?? row.key ?? index}
                  className="theme-table-body-row"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${col.align === "right" ? "text-right tabular-nums" : ""} ${col.mono ? "font-mono text-xs" : ""}`}
                    >
                      {col.render ? col.render(row) : format(col.key, row[col.key], row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {viewAllHref && rows?.length ? (
        <div className="theme-table-footer px-4 py-2 text-right">
          <Link href={viewAllHref} className="theme-link text-xs font-medium">
            {viewAllLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardChartsGrid({ children }) {
  return <div className="grid gap-4 xl:grid-cols-3">{children}</div>;
}

export function formatDashboardKes(value) {
  return formatReportKes(value);
}
