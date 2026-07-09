"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { loadFullReportDataset } from "@/lib/paginated-fetch";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { defaultWorkspaceId } from "@/lib/workspaces";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { formatReportCell, formatReportKes, sumField } from "@/lib/reports/format";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { DonutChart, ReportBarChart, CHART_COLORS } from "@/components/reports/report-charts";
import { filterStructuredReportColumns } from "@/lib/reports/report-column-visibility";

const PAGE_SIZE = 25;

export function CustomReportScreen({ templateId }) {
  const { user, capabilities } = useAuth();
  const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, {});
  const multiBranch = isMultiBranchCatalog(capabilities);
  const [definition, setDefinition] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [applied, setApplied] = useState({ fromDate: "", toDate: "", branchId: "" });

  useEffect(() => {
    apiRequest(`/reports/builder/templates/${templateId}`, {
      searchParams: { workspace_id: workspaceId },
    })
      .then((res) => setDefinition(res.definition))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load report"));
  }, [templateId, workspaceId]);

  useEffect(() => {
    apiRequest("/branches", { searchParams: { per_page: 100 } })
      .then((res) => setBranches(res.data ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId) setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId]);

  const loadReport = useCallback(async () => {
    if (!definition) return;
    setLoading(true);
    setError(null);
    try {
      const searchParams = { per_page: 200, page: 1, workspace_id: workspaceId };
      if (definition.showDateRange) {
        if (applied.fromDate) searchParams.from_date = applied.fromDate;
        if (applied.toDate) searchParams.to_date = applied.toDate;
      }
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      const rows = await loadFullReportDataset(definition.apiPath, searchParams, {
        message: `Loading ${definition.title}…`,
      });
      setAllRows(rows);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [definition, applied, workspaceId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = useMemo(
    () =>
      filterStructuredReportColumns(definition?.columns ?? []).map((col) => ({
        ...col,
        accessor: (row) => row[col.key],
      })),
    [definition],
  );

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return allRows.slice(start, start + PAGE_SIZE);
  }, [allRows, page]);

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));

  const kpis = useMemo(() => {
    if (!definition?.kpis?.length) return [];
    return definition.kpis.map((kpi) => {
      const key = kpi.alias ?? kpi.field;
      const total = sumField(allRows, key);
      const isMoney = /amount|total|sales|revenue|profit|balance|value|kes|cost|price/i.test(kpi.label);
      return {
        id: kpi.id,
        label: kpi.label,
        value: isMoney ? formatReportKes(total) : String(Math.round(total)),
      };
    });
  }, [allRows, definition]);

  const footerTotals = useMemo(() => {
    if (!definition?.footerTotals?.length || !columns.length) return {};
    const totals = { [columns[0]?.key]: "Totals" };
    for (const col of columns) {
      if (!definition.footerTotals.includes(col.key)) continue;
      totals[col.key] = formatReportCell(col.key, sumField(allRows, col.key));
    }
    return totals;
  }, [allRows, columns, definition]);

  function applyFilters() {
    setApplied({ fromDate, toDate, branchId });
  }

  function resetFilters() {
    const empty = { fromDate: "", toDate: "", branchId: user?.branch_id ? String(user.branch_id) : "" };
    setFromDate("");
    setToDate("");
    setBranchId(empty.branchId);
    setApplied(empty);
  }

  const branchLabel = branches.find((b) => String(b.id) === applied.branchId)?.branch_name
    ?? (applied.branchId ? "" : "All branches");

  const exportSearchParams = useMemo(() => {
    const searchParams = { workspace_id: workspaceId };
    if (definition?.showDateRange) {
      if (applied.fromDate) searchParams.from_date = applied.fromDate;
      if (applied.toDate) searchParams.to_date = applied.toDate;
    }
    if (applied.branchId) searchParams.branch_id = applied.branchId;
    return searchParams;
  }, [applied, definition?.showDateRange, workspaceId]);

  if (!definition && !error) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>;
  }

  if (!definition) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <>
      <AppBreadcrumb
        items={[
          { label: "Reports", href: "/reports" },
          { label: "Custom reports", href: "/reports/custom" },
          { label: definition.title },
        ]}
      />
      <ReportPageShell
      section={definition.section}
      title={definition.title}
      subtitle={definition.subtitle}
      exportConfig={{
        filename: definition.title,
        columns: columns.map((col) => ({
          ...col,
          accessor: (row) => formatReportCell(col.key, col.accessor(row), undefined, row),
        })),
        exportSource: {
          path: definition.apiPath,
          searchParams: exportSearchParams,
        },
        meta: {
          fromDate: applied.fromDate,
          toDate: applied.toDate,
          branchName: branchLabel,
        },
        footerRow: Object.keys(footerTotals).length ? footerTotals : null,
        disabled: loading,
      }}
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <ReportFilterBar
        fromDate={fromDate}
        toDate={toDate}
        branchId={branchId}
        branches={branches}
        showDateRange={definition.showDateRange}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onBranchChange={setBranchId}
        onFilter={applyFilters}
        onReset={resetFilters}
        loading={loading}
        showBranchFilter={multiBranch}
      />

      {!loading ? <ReportKpiGrid items={kpis} /> : null}

      {!loading && definition.charts?.length ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {definition.charts.map((chart) => {
            if (chart.type === "bar") {
              return (
                <ReportBarChart
                  key={chart.title ?? chart.valueKey}
                  rows={allRows}
                  labelKey={chart.labelKey}
                  valueKey={chart.valueKey}
                  title={chart.title}
                />
              );
            }
            if (chart.type === "donut") {
              const grouped = aggregateRows(allRows, chart.labelKey, chart.valueKey);
              const total = grouped.reduce((s, g) => s + g.value, 0);
              const segments = grouped.slice(0, chart.limit ?? 5).map((g, i) => ({
                label: g.label,
                value: g.value,
                sharePct: total > 0 ? Math.round((g.value / total) * 1000) / 10 : 0,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }));
              return (
                <div key={chart.title ?? chart.valueKey} className="theme-panel rounded-xl border p-4 shadow-sm">
                  {chart.title ? <h3 className="mb-3 text-sm font-medium text-slate-900">{chart.title}</h3> : null}
                  <DonutChart segments={segments} />
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : (
        <>
          <ReportTable columns={columns} rows={pageRows} footerTotals={footerTotals} />
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={allRows.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}
    </ReportPageShell>
    </>
  );
}

function aggregateRows(rows, labelKey, valueKey) {
  const map = new Map();
  for (const row of rows) {
    const label = String(row[labelKey] ?? "—");
    const val = Number(row[valueKey]) || 0;
    map.set(label, (map.get(label) ?? 0) + val);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
