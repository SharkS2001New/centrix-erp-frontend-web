"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { exportRowsToCsv, formatReportCell, sumField } from "@/lib/reports/format";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { ProfitLossReportScreen } from "@/components/reports/profit-loss-report-screen";
import { ExpensesReportScreen } from "@/components/reports/expenses-report-screen";
import { DonutChart, ReportBarChart, CHART_COLORS } from "@/components/reports/report-charts";

const PAGE_SIZE = 20;

export function StructuredReportScreen({ definition }) {
  if (definition.variant === "profit-loss") {
    return <ProfitLossReportScreen definition={definition} />;
  }
  if (definition.variant === "expenses") {
    return <ExpensesReportScreen definition={definition} />;
  }

  return <StandardReportScreen definition={definition} />;
}

function StandardReportScreen({ definition }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [legacyRows, setLegacyRows] = useState([]);
  const [reportMeta, setReportMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [legacyPage, setLegacyPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [extraFilters, setExtraFilters] = useState({});
  const [applied, setApplied] = useState({ fromDate: "", toDate: "", branchId: "", extraFilters: {} });
  const [legacyArchiveMeta, setLegacyArchiveMeta] = useState(null);

  const includeLegacy = Boolean(applied.extraFilters?.include_legacy_archive);

  useEffect(() => {
    apiRequest("/branches", { searchParams: { per_page: 100 } })
      .then((res) => setBranches(res.data ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId) setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = { per_page: PAGE_SIZE, page };
      if (definition.dateColumn) {
        searchParams.date_column = definition.dateColumn;
        if (applied.fromDate) searchParams.from_date = applied.fromDate;
        if (applied.toDate) searchParams.to_date = applied.toDate;
      }
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      if (applied.extraFilters?.include_legacy_archive) {
        searchParams.include_legacy_archive = 1;
        searchParams.legacy_page = legacyPage;
      }

      const res = await apiRequest(definition.apiPath, { searchParams });
      let centrixRows = res.data ?? [];
      setLegacyArchiveMeta(res.legacy_archive ?? null);
      setLegacyRows(res.legacy_archive?.data ?? []);
      if (definition.filterRows) {
        centrixRows = definition.filterRows(centrixRows, applied.extraFilters);
      }
      setRows(centrixRows);
      setReportMeta({
        current_page: res.current_page ?? page,
        last_page: res.last_page ?? 1,
        total: res.total ?? centrixRows.length,
        per_page: res.per_page ?? PAGE_SIZE,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setLegacyRows([]);
      setReportMeta(null);
      setLegacyArchiveMeta(null);
    } finally {
      setLoading(false);
    }
  }, [definition, applied, page, legacyPage]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totalPages = reportMeta?.last_page ?? 1;
  const legacyMeta = legacyArchiveMeta?.meta;
  const legacyTotalPages = legacyMeta?.last_page ?? 1;

  const displayRows = useMemo(() => rows, [rows]);
  const chartRows = useMemo(
    () => (includeLegacy ? [...rows, ...legacyRows] : rows),
    [rows, legacyRows, includeLegacy],
  );

  const kpis = useMemo(() => {
    if (!definition.kpis) return [];
    const kpiRows = includeLegacy ? [...rows, ...legacyRows] : rows;
    return definition.kpis.map((kpi) => {
      const result = kpi.compute(kpiRows);
      return { id: kpi.id, label: kpi.label, value: result.value, hint: result.hint };
    });
  }, [rows, legacyRows, includeLegacy, definition.kpis]);

  const footerTotals = useMemo(() => {
    if (!definition.footerTotals || !definition.columns) return {};
    const totalRows = includeLegacy ? [...rows, ...legacyRows] : rows;
    const totals = { [definition.columns[0]?.key]: "Totals (this page)" };
    for (const col of definition.columns) {
      if (!col.total) continue;
      totals[col.key] = formatReportCell(col.key, sumField(totalRows, col.key));
    }
    return totals;
  }, [rows, legacyRows, includeLegacy, definition.columns, definition.footerTotals]);

  function applyFilters() {
    setPage(1);
    setLegacyPage(1);
    setApplied({ fromDate, toDate, branchId, extraFilters });
  }

  function resetFilters() {
    const empty = { fromDate: "", toDate: "", branchId: user?.branch_id ? String(user.branch_id) : "", extraFilters: {} };
    setFromDate("");
    setToDate("");
    setBranchId(empty.branchId);
    setExtraFilters({});
    setApplied(empty);
    setPage(1);
    setLegacyPage(1);
  }

  function handleExport() {
    if (!definition.columns) return;
    exportRowsToCsv(
      `${definition.key ?? "report"}.csv`,
      definition.columns.map((col) => ({
        label: col.label,
        accessor: (row) => {
          const raw = col.accessor(row);
          return raw == null ? "" : formatReportCell(col.key, raw);
        },
      })),
      [...rows, ...legacyRows],
    );
  }

  return (
    <ReportPageShell
      section={definition.section}
      title={definition.title}
      subtitle={definition.subtitle}
      onExport={definition.columns ? handleExport : undefined}
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {legacyArchiveMeta?.available && (legacyArchiveMeta.meta?.total ?? 0) > 0 ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Showing <strong>{legacyRows.length}</strong> of <strong>{legacyArchiveMeta.meta.total}</strong> legacy archive
          row(s) from <strong>{legacyArchiveMeta.label ?? "legacy archive"}</strong>
          {legacyArchiveMeta.cutover_date ? ` (cutover ${legacyArchiveMeta.cutover_date})` : ""}. Browse individual
          sales under{" "}
          <Link href="/reports/legacy-archive" className="font-medium text-[#185FA5] hover:underline">
            Legacy sales archive
          </Link>
          .
        </p>
      ) : null}

      {legacyArchiveMeta?.requires_date_range && includeLegacy ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {legacyArchiveMeta.message ?? "Set from and to dates, then filter, to load legacy archive rows."}
        </p>
      ) : null}

      {legacyArchiveMeta?.available === false && applied.extraFilters?.include_legacy_archive ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {legacyArchiveMeta.message ?? "Legacy archive is not available for this organization."}
        </p>
      ) : null}

      <ReportFilterBar
        fromDate={fromDate}
        toDate={toDate}
        branchId={branchId}
        branches={branches}
        showDateRange={definition.showDateRange !== false && Boolean(definition.dateColumn)}
        extraFilters={definition.extraFilters ?? []}
        extraValues={extraFilters}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onBranchChange={setBranchId}
        onExtraChange={(id, value) => setExtraFilters((f) => ({ ...f, [id]: value }))}
        onFilter={applyFilters}
        onReset={resetFilters}
        loading={loading}
      />

      {!loading ? <ReportKpiGrid items={kpis} /> : null}

      {!loading && definition.charts?.length ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {definition.charts.map((chart) => {
            if (chart.type === "bar") {
              return (
                <ReportBarChart
                  key={chart.title ?? chart.valueKey}
                  rows={chartRows}
                  labelKey={chart.labelKey}
                  valueKey={chart.valueKey}
                  title={chart.title}
                />
              );
            }
            if (chart.type === "donut") {
              const grouped = aggregateChartRows(chartRows, chart.labelKey, chart.valueKey);
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
          <ReportTable columns={definition.columns ?? []} rows={displayRows} footerTotals={footerTotals} />
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={reportMeta?.total ?? rows.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
          {includeLegacy && legacyRows.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Legacy archive — {legacyArchiveMeta?.label ?? "pre-cutover sales"}
              </h2>
              <ReportTable columns={definition.columns ?? []} rows={legacyRows} />
              <PaginationBar
                page={legacyPage}
                totalPages={legacyTotalPages}
                total={legacyMeta?.total ?? legacyRows.length}
                pageSize={legacyMeta?.per_page ?? PAGE_SIZE}
                onChange={setLegacyPage}
              />
            </div>
          ) : null}
        </>
      )}
    </ReportPageShell>
  );
}

function aggregateChartRows(rows, labelKey, valueKey) {
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
