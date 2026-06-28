"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { defaultDashboardDateRange } from "@/lib/dashboard-dates";
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
} from "@/components/dashboard/dashboard-shared";
import { WORKSPACE_DASHBOARD_SCOPES } from "@/lib/workspace-reports";

export function useReportsDashboard({ fromDate, toDate, branchId, enabled = true }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const searchParams = { from_date: fromDate, to_date: toDate };
    if (branchId) searchParams.branch_id = branchId;
    apiRequest("/reports/dashboard", { searchParams })
      .then(setDashboard)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, branchId, enabled]);

  return { dashboard, loading, error };
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
}) {
  const { user } = useAuth();
  const defaults = defaultDashboardDateRange();
  const [fromDate, setFromDate] = useState(controlledFrom ?? defaults.from);
  const [toDate, setToDate] = useState(controlledTo ?? defaults.to);
  const [branchId, setBranchId] = useState(controlledBranch ?? "");
  const [branches, setBranches] = useState([]);

  const effectiveFrom = controlledFrom ?? fromDate;
  const effectiveTo = controlledTo ?? toDate;
  const effectiveBranch = controlledBranch ?? branchId;

  const { dashboard, loading, error } = useReportsDashboard({
    fromDate: effectiveFrom,
    toDate: effectiveTo,
    branchId: effectiveBranch,
  });

  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);

  useEffect(() => {
    apiRequest("/branches", { searchParams: { per_page: 100 } })
      .then((res) => setBranches(res.data ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId && controlledBranch === undefined) {
      setBranchId(String(user.branch_id));
    }
  }, [user?.branch_id, branchId, controlledBranch]);

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
        label: channelLabel(c.channel),
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
      label: "Inventory Value",
      value: dashboard?.kpis?.inventory_value?.value,
      changePct: dashboard?.kpis?.inventory_value?.change_pct,
    },
  ].filter((item) => scope.kpis.includes(item.id));

  const showSalesTrend = scope.charts.includes("sales_trend");
  const showTopProducts = scope.charts.includes("top_products");
  const showSalesByChannel = scope.charts.includes("sales_by_channel");

  if (!kpiItems.length && !showSalesTrend && !showTopProducts && !showSalesByChannel) {
    return null;
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {showFilters && controlledFrom === undefined ? (
        <DashboardDateRangeBar
          fromDate={fromDate}
          toDate={toDate}
          branchId={branchId}
          branches={branches}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onBranchChange={setBranchId}
        />
      ) : null}

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
