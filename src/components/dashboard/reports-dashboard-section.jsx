"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api"
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { defaultDashboardDateRange } from "@/lib/dashboard-dates";
import { defaultReportBranchId } from "@/lib/reports/report-filters";
import {
  CHART_COLORS,
  DonutChart,
  SalesTrendChart,
  channelLabel,
} from "@/components/reports/report-charts";
import {
  DashboardChartsGrid,
  DashboardDateRangeBar,
  DashboardKpiGrid,
  DashboardPanel,
  DashboardRefreshButton,
} from "@/components/dashboard/dashboard-shared";
import { WORKSPACE_DASHBOARD_SCOPES } from "@/lib/workspace-reports";
import { P } from "@/lib/permission-codes";

export function useReportsDashboard({ fromDate, toDate, branchId, enabled = true }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const searchParams = { from_date: fromDate, to_date: toDate };
    if (branchId) searchParams.branch_id = branchId;
    apiRequest("/reports/dashboard", { searchParams })
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, branchId, enabled, reloadToken]);

  return { dashboard, loading, error, reload };
}

export function ReportsDashboardSection({
  fromDate: controlledFrom,
  toDate: controlledTo,
  branchId: controlledBranch,
  showFilters = true,
  showKpis = true,
  showCharts = true,
  compact = false,
  workspaceScope = "backoffice",
  onError,
  enabled: enabledProp,
  refreshKey = 0,
}) {
  const { user, isOrgWide, hasPermission } = useAuth();
  const canViewReports = hasPermission(P.reports.hub.view);
  const enabled = enabledProp ?? canViewReports;
  const defaults = defaultDashboardDateRange();
  const branchInitialized = useRef(false);
  const [fromDate, setFromDate] = useState(controlledFrom ?? defaults.from);
  const [toDate, setToDate] = useState(controlledTo ?? defaults.to);
  const [branchId, setBranchId] = useState(controlledBranch ?? "");
  const [branches, setBranches] = useState([]);

  const effectiveFrom = controlledFrom ?? fromDate;
  const effectiveTo = controlledTo ?? toDate;
  const effectiveBranch = controlledBranch ?? branchId;

  const { dashboard, loading, error, reload } = useReportsDashboard({
    fromDate: effectiveFrom,
    toDate: effectiveTo,
    branchId: effectiveBranch,
    enabled,
  });

  useEffect(() => {
    if (refreshKey > 0) reload();
  }, [refreshKey, reload]);

  useEffect(() => {
    if (error && enabled) onError?.(error);
  }, [error, enabled, onError]);

  useEffect(() => {
    if (!enabled) return;
    fetchBranchesCached()
      .then((rows) => setBranches(rows ?? []))
      .catch(() => setBranches([]));
  }, [enabled]);

  useEffect(() => {
    if (controlledBranch !== undefined || !user || branchInitialized.current) return;
    branchInitialized.current = true;
    setBranchId(defaultReportBranchId(user, isOrgWide));
  }, [user, isOrgWide, controlledBranch, enabled]);

  const topProductSegments = useMemo(
    () =>
      (dashboard?.top_products ?? []).map((p, i) => ({
        label: p.product_name ?? p.product_code,
        value: p.revenue,
        sharePct: p.share_pct,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [dashboard],
  );

  const channelSegments = useMemo(
    () =>
      (dashboard?.sales_by_channel ?? []).map((c, i) => ({
        label: c.channel_label ?? channelLabel(c.channel),
        value: c.revenue,
        sharePct: c.share_pct,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [dashboard],
  );

  const scope = WORKSPACE_DASHBOARD_SCOPES[workspaceScope] ?? WORKSPACE_DASHBOARD_SCOPES.backoffice;

  const kpiItems = [
    {
      id: "total_sales",
      label: "Total Sales",
      value: dashboard?.kpis?.total_sales?.value,
      changePct: dashboard?.kpis?.total_sales?.change_pct,
    },
    {
      id: "gross_profit",
      label: "Gross Profit",
      value: dashboard?.kpis?.gross_profit?.value,
      changePct: dashboard?.kpis?.gross_profit?.change_pct,
    },
    {
      id: "receivables",
      label: "Receivables",
      value: dashboard?.kpis?.receivables?.value,
      changePct: dashboard?.kpis?.receivables?.change_pct,
    },
    {
      id: "inventory_value",
      label: "Stock Value",
      value: dashboard?.kpis?.inventory_value?.value,
      changePct: dashboard?.kpis?.inventory_value?.change_pct,
    },
  ].filter((item) => scope.kpis.includes(item.id));

  const showSalesTrend = scope.charts.includes("sales_trend");
  const showTopProducts = scope.charts.includes("top_products");
  const showSalesByChannel = scope.charts.includes("sales_by_channel");
  const showDateFilters = showFilters && controlledFrom === undefined;

  if (!enabled) {
    return null;
  }

  if (!kpiItems.length && !showSalesTrend && !showTopProducts && !showSalesByChannel) {
    return null;
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {showDateFilters ? (
        <DashboardDateRangeBar
          fromDate={fromDate}
          toDate={toDate}
          branchId={branchId}
          branches={branches}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onBranchChange={setBranchId}
          onRefresh={reload}
          refreshing={loading}
        />
      ) : (
        <div className="mb-2 flex justify-end">
          <DashboardRefreshButton onClick={reload} loading={loading} />
        </div>
      )}

      {showKpis && kpiItems.length ? <DashboardKpiGrid items={kpiItems} variant="hub" /> : null}

      {showCharts && (showSalesTrend || showTopProducts || showSalesByChannel) ? (
        <DashboardChartsGrid>
          {showSalesTrend ? (
          <DashboardPanel
            title="Sales trend"
            subtitle="This period vs last period"
            className="xl:col-span-2"
          >
            <SalesTrendChart points={dashboard?.sales_trend} loading={loading} />
          </DashboardPanel>
          ) : null}
          {showTopProducts ? (
          <DashboardPanel title="Top products" subtitle="By revenue in selected period">
            <DonutChart segments={topProductSegments} loading={loading} />
          </DashboardPanel>
          ) : null}
          {showSalesByChannel ? (
          <DashboardPanel title="Sales by channel" subtitle="Revenue distribution" className="xl:col-span-3 lg:col-span-1">
            <DonutChart segments={channelSegments} loading={loading} emptyMessage="No channel sales in this period." />
          </DashboardPanel>
          ) : null}
        </DashboardChartsGrid>
      ) : null}
    </div>
  );
}
