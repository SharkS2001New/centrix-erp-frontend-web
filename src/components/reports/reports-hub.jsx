"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { defaultWorkspaceId } from "@/lib/workspaces";
import {
  WORKSPACE_REPORT_OVERVIEW_LABEL,
  WORKSPACE_REPORTS_LABEL,
  filterReportCategoriesForWorkspace,
} from "@/lib/workspace-reports";
import { CatalogPageShell, inputClassName } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { ReportsOverviewSummary } from "@/components/reports/reports-overview-summary";
import { DashboardErrorBanner, DashboardSection } from "@/components/dashboard/dashboard-shared";
import {
  buildReportCategories,
  flattenReports,
  reportHref,
} from "@/lib/reports/catalog-ui";
import {
  customReportBelongsToWorkspace,
  mergeCustomReportsIntoCategories,
} from "@/lib/reports/custom-reports";
import { canViewReport, P } from "@/lib/permission-codes";

const CATEGORY_ICONS = {
  sales: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-8 4 5 5-9" />
    </svg>
  ),
  customers: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1M9 20H4v-2a4 4 0 014-4h1m8-4a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  inventory: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  purchases: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-2 9m12-9l2 9m-8-4h4" />
    </svg>
  ),
  pos: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m-6 4h6m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  finance: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  compliance: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  payroll: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m4-4h-6m0 0l3-3m-3 3l3 3" />
    </svg>
  ),
  other: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
};

export function ReportsHub() {
  const { hasPermission, capabilities } = useAuth();
  const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, {});
  const workspaceLabel = WORKSPACE_REPORTS_LABEL[workspaceId] ?? "Reports";
  const [catalog, setCatalog] = useState(null);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [error, setError] = useState(null);
  const [dashError, setDashError] = useState(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("cards");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    apiRequest("/reports/")
      .then(setCatalog)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load catalog"));
  }, []);

  useEffect(() => {
    if (!hasPermission(P.reports.builder.view)) return;
    apiRequest("/reports/builder/templates", { searchParams: { workspace_id: workspaceId } })
      .then((res) => setCustomTemplates(res.data ?? []))
      .catch(() => setCustomTemplates([]));
  }, [hasPermission, workspaceId]);

  const categories = useMemo(() => {
    const built = buildReportCategories(catalog);
    const permitted = built
      .map((cat) => ({
        ...cat,
        reports: cat.reports.filter((r) => canViewReport(r.key, hasPermission)),
      }))
      .filter((cat) => cat.reports.length > 0)
      .map((cat) => ({ ...cat, count: cat.reports.length }));

    const workspaceTemplates = customTemplates.filter((template) =>
      customReportBelongsToWorkspace(template, workspaceId),
    );
    const withCustom = mergeCustomReportsIntoCategories(permitted, workspaceTemplates);

    return filterReportCategoriesForWorkspace(withCustom, workspaceId, capabilities?.modules);
  }, [catalog, customTemplates, hasPermission, workspaceId, capabilities?.modules]);
  const allReports = useMemo(() => flattenReports(categories), [categories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .map((cat) => {
        if (activeCategory !== "all" && cat.id !== activeCategory) return null;
        const reports = cat.reports.filter(
          (r) => !q || r.label.toLowerCase().includes(q) || cat.title.toLowerCase().includes(q),
        );
        if (!reports.length) return null;
        return { ...cat, reports, count: reports.length };
      })
      .filter(Boolean);
  }, [categories, search, activeCategory]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allReports.filter((r) => {
      if (activeCategory !== "all" && r.categoryId !== activeCategory) return false;
      if (!q) return true;
      return r.label.toLowerCase().includes(q) || r.categoryTitle.toLowerCase().includes(q);
    });
  }, [allReports, search, activeCategory]);

  const totalReportCount = allReports.length;
  const customReportCount = allReports.filter((r) => r.isCustom).length;

  return (
    <CatalogPageShell
      title={WORKSPACE_REPORT_OVERVIEW_LABEL}
      subtitle={workspaceLabel}
    >
      <AdminBreadcrumb items={[{ label: WORKSPACE_REPORT_OVERVIEW_LABEL }]} />

      {hasPermission(P.reports.builder.view) ? (
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href="/reports/builder"
            className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            + Create custom report
          </Link>
        </div>
      ) : null}

      <DashboardErrorBanner message={error ?? dashError} />

      <ReportsOverviewSummary
        workspaceId={workspaceId}
        totalReports={totalReportCount}
        categoryCount={categories.length}
        customReportCount={customReportCount}
        onError={setDashError}
      />

      <DashboardSection title="All reports" subtitle={`Browse ${totalReportCount} reports in this module`}>
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <input
            type="search"
            placeholder="Search reports…"
            className={`${inputClassName()} w-56`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "cards" ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}
            >
              Card view
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}
            >
              List view
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="shrink-0 lg:w-52">
            <nav className="space-y-1 theme-panel rounded-xl border p-2 shadow-sm">
              <CategoryNavItem
                label="All categories"
                count={totalReportCount}
                active={activeCategory === "all"}
                onClick={() => setActiveCategory("all")}
              />
              {categories.map((cat) => (
                <CategoryNavItem
                  key={cat.id}
                  label={cat.title.replace(/ Reports$/, "")}
                  count={cat.count}
                  active={activeCategory === cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                />
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            {viewMode === "cards" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredCategories.map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    category={cat}
                    onViewAll={() => {
                      setActiveCategory(cat.id);
                      setViewMode("list");
                      setSearch("");
                    }}
                  />
                ))}
                {!filteredCategories.length && catalog ? (
                  <p className="col-span-full text-sm text-slate-500">No reports match your search.</p>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
                {filteredList.map((r) => (
                  <li key={`${r.categoryId}:${r.key}`} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {r.label}
                        {r.isCustom ? (
                          <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                            Custom
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">{r.categoryTitle}</p>
                    </div>
                    <Link href={r.href} className="shrink-0 text-xs font-medium text-indigo-600 hover:underline">
                      Open →
                    </Link>
                  </li>
                ))}
                {!filteredList.length && catalog ? (
                  <li className="px-4 py-6 text-sm text-slate-500">No reports match your search.</li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      </DashboardSection>
    </CatalogPageShell>
  );
}

function CategoryNavItem({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
        active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <span>{label}</span>
      <span className="text-xs text-slate-400">{count}</span>
    </button>
  );
}

function CategoryCard({ category, onViewAll }) {
  const preview = category.reports.slice(0, 5);
  const icon = CATEGORY_ICONS[category.icon] ?? CATEGORY_ICONS.other;

  return (
    <article className="flex flex-col theme-panel rounded-xl border p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{category.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm">
        {preview.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="text-slate-700 hover:text-indigo-600 hover:underline">
              {r.label}
              {r.isCustom ? <span className="ml-1 text-[10px] uppercase text-indigo-500">Custom</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {category.count > preview.length ? (
        <button type="button" className="mt-4 text-left text-xs font-medium text-indigo-600 hover:underline" onClick={onViewAll}>
          View all {category.count} reports
        </button>
      ) : null}
    </article>
  );
}

export { reportHref };
