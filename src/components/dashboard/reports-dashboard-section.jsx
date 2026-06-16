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
  ];

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

      {showKpis ? <DashboardKpiGrid items={kpiItems} variant="hub" /> : null}

      {showCharts ? (
        <DashboardChartsGrid>
          <DashboardPanel
            title="Sales trend"
            subtitle="This period vs last period"
            className="xl:col-span-2"
          >
            <SalesTrendChart points={dashboard?.sales_trend} loading={loading} />
          </DashboardPanel>
          <DashboardPanel title="Top products" subtitle="By revenue in selected period">
            <DonutChart segments={topProductSegments} loading={loading} />
          </DashboardPanel>
          <DashboardPanel title="Sales by channel" subtitle="Revenue distribution" className="xl:col-span-3 lg:col-span-1">
            <DonutChart segments={channelSegments} loading={loading} emptyMessage="No channel sales in this period." />
          </DashboardPanel>
        </DashboardChartsGrid>
      ) : null}
    </div>
  );
}
