"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api"
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  invalidateTabAwareDataLoad,
  markTabAwareDataLoaded,
  useTabAwareDataLoad,
  useTabPaneActive,
} from "@/contexts/tab-pane-activity-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { defaultWorkspaceId } from "@/lib/workspaces";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { formatReportCell, formatReportKes, sumField } from "@/lib/reports/format";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
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
  const { paneHref } = useTabPaneActive();
  const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, {});
  const multiBranch = isMultiBranchCatalog(capabilities);
  const [definition, setDefinition] = useState(null);
  const [rows, setRows] = useState([]);
  const [reportMeta, setReportMeta] = useState(null);
  const [reportSummary, setReportSummary] = useState(null);
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
      loading: false,
    })
      .then((res) => setDefinition(res.definition))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load report"));
  }, [templateId, workspaceId]);

  useEffect(() => {
    fetchBranchesCached()
      .then((list) => setBranches(list ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId) setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId]);

  const appliedKey = useMemo(
    () => JSON.stringify({ fromDate: applied.fromDate, toDate: applied.toDate, branchId: applied.branchId }),
    [applied],
  );
  const depsKey = `${templateId}|${definition?.apiPath ?? ""}|${page}|${appliedKey}|${workspaceId}`;

  const loadReport = useCallback(async () => {
    if (!definition) return;
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: PAGE_SIZE,
        page,
        workspace_id: workspaceId,
      };
      if (definition.showDateRange) {
        if (applied.fromDate) searchParams.from_date = applied.fromDate;
        if (applied.toDate) searchParams.to_date = applied.toDate;
      }
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      const res = await apiRequest(definition.apiPath, { searchParams, loading: false });
      setRows(normalizeReportRows(res));
      setReportMeta(normalizeReportMeta(res, page, PAGE_SIZE));
      setReportSummary(normalizeReportSummary(res));
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setReportMeta(null);
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [definition, applied, workspaceId, page, paneHref, depsKey]);

  const hasData = rows.length > 0 || reportMeta != null;
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const columns = useMemo(
    () =>
      filterStructuredReportColumns(definition?.columns ?? []).map((col) => ({
        ...col,
        accessor: (row) => row[col.key],
      })),
    [definition],
  );

  const totalPages = reportMeta?.last_page ?? 1;

  const kpis = useMemo(() => {
    if (!definition?.kpis?.length) return [];
    return definition.kpis.map((kpi) => {
      const key = kpi.alias ?? kpi.field;
      const total =
        reportSummary?.[key] != null ? Number(reportSummary[key]) || 0 : sumField(rows, key);
      const isMoney = /amount|total|sales|revenue|profit|balance|value|kes|cost|price/i.test(kpi.label);
      return {
        id: kpi.id,
        label: kpi.label,
        value: isMoney ? formatReportKes(total) : String(Math.round(total)),
      };
    });
  }, [rows, reportSummary, definition]);

  const footerTotals = useMemo(() => {
    if (!definition?.footerTotals?.length || !columns.length) return {};
    const totals = { [columns[0]?.key]: "Totals" };
    for (const col of columns) {
      if (!definition.footerTotals.includes(col.key)) continue;
      const value =
        reportSummary?.[col.key] != null
          ? Number(reportSummary[col.key]) || 0
          : sumField(rows, col.key);
      totals[col.key] = formatReportCell(col.key, value);
    }
    return totals;
  }, [rows, columns, definition, reportSummary]);

  function applyFilters() {
    setPage(1);
    setApplied({ fromDate, toDate, branchId });
  }

  function resetFilters() {
    const empty = { fromDate: "", toDate: "", branchId: user?.branch_id ? String(user.branch_id) : "" };
    setFromDate("");
    setToDate("");
    setBranchId(empty.branchId);
    setPage(1);
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

  const chartRows = rows;

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
        onExtraChange={() => {}}
        onFilter={applyFilters}
        onRefresh={() => void refreshReport()}
        onReset={resetFilters}
        loading={loading}
        showBranchFilter={multiBranch}
      />

      {!loading ? <ReportKpiGrid items={kpis} /> : null}

      {!loading && definition.charts?.length ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {definition.charts.map((chart) => {
            if (chart.type === "donut") {
              return (
                <DonutChart
                  key={chart.title}
                  title={chart.title}
                  rows={chartRows}
                  labelKey={chart.labelKey}
                  valueKey={chart.valueKey}
                  colors={CHART_COLORS}
                />
              );
            }
            return (
              <ReportBarChart
                key={chart.title}
                title={chart.title}
                rows={chartRows}
                labelKey={chart.labelKey}
                valueKey={chart.valueKey}
                colors={CHART_COLORS}
              />
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : (
        <>
          <ReportTable columns={columns} rows={rows} footerTotals={footerTotals} />
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={reportMeta?.total ?? rows.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}
    </ReportPageShell>
    </>
  );
}
