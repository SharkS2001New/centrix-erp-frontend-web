"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { StatCard } from "@/components/catalog/catalog-shared";
import { formatHrKesFull } from "@/components/hr/hr-shared";
import { DashboardKpiGrid, DashboardSection } from "@/components/dashboard/dashboard-shared";
import { ReportsDashboardSection } from "@/components/dashboard/reports-dashboard-section";
import { WORKSPACE_DASHBOARD_SCOPES } from "@/lib/workspace-reports";

export function ReportsOverviewSummary({
  workspaceId,
  totalReports,
  categoryCount,
  customReportCount,
  onError,
}) {
  const scope = WORKSPACE_DASHBOARD_SCOPES[workspaceId];
  const showSalesDashboard = Boolean(scope?.kpis?.length || scope?.charts?.length);

  return (
    <DashboardSection
      title="Summary"
      subtitle="Report catalog and key metrics for this module"
      className="mb-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Available reports" value={String(totalReports)} />
        <StatCard label="Report categories" value={String(categoryCount)} />
        <StatCard
          label="Custom reports"
          value={String(customReportCount)}
          hint="Saved from the report builder"
        />
      </div>

      {showSalesDashboard ? (
        <ReportsDashboardSection workspaceScope={workspaceId} onError={onError} compact />
      ) : null}

      {workspaceId === "hr" ? <HrReportsMetrics onError={onError} /> : null}
    </DashboardSection>
  );
}

function HrReportsMetrics({ onError }) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    apiRequest("/reports/hr-dashboard-kpi", { searchParams: { per_page: 1 } })
      .then((res) => setMetrics(res.data?.[0] ?? null))
      .catch((e) => onError?.(e instanceof Error ? e.message : "Failed to load workforce summary"))
      .finally(() => setLoading(false));
  }, [onError]);

  const items = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        id: "employees",
        label: "Employees",
        value: Number(metrics.total_employees ?? 0).toLocaleString(),
      },
      {
        id: "active",
        label: "Active staff",
        value: Number(metrics.active_employees ?? 0).toLocaleString(),
      },
      {
        id: "departments",
        label: "Departments",
        value: Number(metrics.department_count ?? 0).toLocaleString(),
      },
      {
        id: "payroll",
        label: "Monthly base payroll",
        value: formatHrKesFull(metrics.monthly_base_payroll ?? 0),
      },
      {
        id: "contracts",
        label: "Contracts expiring (90d)",
        value: Number(metrics.contracts_expiring_90d ?? 0).toLocaleString(),
      },
      {
        id: "payroll_runs",
        label: "Processed payroll runs",
        value: Number(metrics.processed_payroll_runs ?? 0).toLocaleString(),
      },
    ];
  }, [metrics]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading workforce metrics…</p>;
  }

  if (!items.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">Workforce snapshot</p>
      <DashboardKpiGrid
        items={items.map((item) => ({
          ...item,
          hint: item.id === "payroll" ? "Active employees — base salaries" : undefined,
        }))}
        variant="hub"
      />
    </div>
  );
}
