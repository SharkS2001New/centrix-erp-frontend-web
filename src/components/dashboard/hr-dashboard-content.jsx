"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { DonutChart, CHART_COLORS } from "@/components/reports/report-charts";

import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";

const HR_LINKS = [
  { href: "/hr/employees", title: "Employees", desc: "Staff records and contracts", permission: P.hr.employees.view },
  { href: "/hr/attendance", title: "Today's attendance", desc: "Who is in today", permission: P.hr.attendance.view },
  { href: "/hr/attendance-clock", title: "Attendance clock-in", desc: "Fingerprint terminals and Centrix Attendance Agent", permissionAny: [P.admin.attendance_clock.view, P.hr.manage] },
  { href: "/hr/attendance/history", title: "Previous attendance", desc: "Yesterday’s records; filter by date or employee", permission: P.hr.attendance_history.view },
  { href: "/hr/missed-punches", title: "Missed punches", desc: "Unapplied terminal scans and forgotten clock-outs", permission: P.hr.missed_punches.view },
  { href: "/hr/duplicate-punches", title: "Duplicate punches", desc: "Extra scans in the same hour; first punch still counts", permission: P.hr.duplicate_punches.view },
  { href: "/hr/absents", title: "Absents", desc: "Scheduled days with no clock-in", permission: P.hr.absents.view },
  { href: "/hr/lateness", title: "Lateness", desc: "Late clock-in and late return from lunch", permission: P.hr.lateness.view },
  { href: "/hr/leave", title: "Leave & off days", desc: "Leave requests and balances", permission: P.hr.leave.view },
  { href: "/hr/payroll", title: "Payroll", desc: "Pay runs and payslips", permission: P.hr.payroll.view },
  { href: "/hr/pending-overtime", title: "Pending overtimes", desc: "Late clock-out awaiting approve or deny", permission: P.hr.pending_overtime.view },
  { href: "/hr/overtime", title: "Overtime", desc: "Approved overtime entries", permission: P.hr.overtime.view },
  { href: "/hr/allowances", title: "Allowances", desc: "Recurring allowances", permission: P.hr.allowances.view },
  { href: "/hr/deductions", title: "Deductions", desc: "Statutory and other deductions", permission: P.hr.deductions.view },
  { href: "/reports/leave-balance", title: "Leave balance", desc: "Annual, sick, and off-day balances", permission: P.hr.leave.view },
  { href: "/reports/attendance-register", title: "Attendance register", desc: "Daily check-in/out and paid hours", permission: P.hr.attendance.view },
  { href: "/reports/lateness-list", title: "Lateness list", desc: "Clock-in late, lunch late, overall lateness, and waivers", permission: P.hr.lateness.view },
  { href: "/reports/payroll-summary", title: "Payroll summary", desc: "Payroll runs summary", permission: P.hr.payroll.view },
  { href: "/reports/statutory-deductions", title: "Statutory deductions", desc: "Gross, PAYE, NSSF, SHIF, Housing Levy, Net", permission: P.hr.payroll.view },
  { href: "/reports/bank-transfer", title: "Bank transfer", desc: "Net pay bank payment file", permission: P.hr.payroll.view },
  { href: "/reports/nssf-remittance", title: "NSSF remittance", desc: "Member + employer NSSF statement", permission: P.hr.payroll.view },
  { href: "/reports/other-deductions", title: "Other deductions", desc: "Custom deductions by pay period", permission: P.hr.payroll.view },
  { href: "/reports/headcount", title: "Headcount", desc: "Workforce by department and branch", permission: P.hr.employees.view },
  { href: "/reports/contract-expiry", title: "Contract expiry", desc: "Upcoming contract end dates", permission: P.hr.employees.view },
  { href: "/reports/staff-turnover", title: "Staff turnover", desc: "Turnover rate by department", permission: P.hr.employees.view },
  { href: "/reports/hr-dashboard-kpi", title: "Workforce summary", desc: "Organization-wide headcount, payroll, and contracts", permission: P.hr.employees.view },
];

export function HrDashboardContent() {
  const { hasPermission } = useAuth();
  const links = useMemo(
    () => HR_LINKS.filter((link) => {
      if (link.permissionAny?.length) {
        return link.permissionAny.some((code) => hasPermission(code));
      }
      return !link.permission || hasPermission(link.permission);
    }),
    [hasPermission],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recentEmployees, setRecentEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);

  const loadDashboard = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [summaryRes, empRes, deptRes, payrollRes] = await Promise.all([
        apiRequest("/employees/summary"),
        apiRequest("/employees", {
          searchParams: {
            per_page: 8,
            fields: "lean",
            sort: "created_at",
            sort_dir: "desc",
          },
        }),
        apiRequest("/departments", { searchParams: { per_page: 200 } }),
        apiRequest("/reports/payroll-summary", { searchParams: { per_page: 5 } }).catch(() => ({ data: [] })),
      ]);
      setSummary(summaryRes ?? null);
      setRecentEmployees(empRes.data ?? []);
      setDepartments(deptRes.data ?? []);
      setPayrollRuns(payrollRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load HR dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useTabAwareDataLoad(loadDashboard);

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const stats = useMemo(() => {
    return {
      total: Number(summary?.total ?? 0),
      active: Number(summary?.active ?? 0),
      departments: Number(summary?.departments ?? departments.filter((d) => d.is_active !== false).length),
      payrollCost: Number(summary?.payroll_cost ?? 0),
    };
  }, [summary, departments]);

  const deptSegments = useMemo(() => {
    const counts = summary?.by_department_id ?? {};
    return Object.entries(counts)
      .map(([id, value]) => ({
        label:
          id === "null"
            ? "Unassigned"
            : deptById.get(Number(id))?.department_name ?? `Dept #${id}`,
        value: Number(value),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((row, i) => ({
        ...row,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [summary, deptById]);

  const recentRows = useMemo(
    () =>
      recentEmployees.map((e) => ({
        id: e.id,
        name: composeEmployeeDisplayName(e),
        department:
          e.department?.department_name ??
          deptById.get(e.department_id)?.department_name ??
          "—",
        salary: e.base_salary,
        status: e.is_active === false ? "Inactive" : "Active",
      })),
    [recentEmployees, deptById],
  );

  const kpiItems = [
    { id: "total", label: "Employees", value: stats.total.toLocaleString() },
    { id: "active", label: "Active", value: stats.active.toLocaleString() },
    { id: "depts", label: "Departments", value: stats.departments.toLocaleString() },
    {
      id: "payroll",
      label: "Monthly payroll",
      value: formatHrKesFull(stats.payrollCost),
      hint: "Base salaries (active)",
    },
  ];

  return (
    <CatalogPageShell
      title="HR Overview"
      subtitle="Workforce summary and payroll readiness"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <DashboardRefreshButton onClick={() => void loadDashboard({ soft: true })} loading={loading || refreshing} />
          <PrimaryLink href="/hr/employees/new">Add employee</PrimaryLink>
        </div>
      }
    >
      <DashboardErrorBanner message={error} />

      {loading ? (
        <DashboardLoading />
      ) : (
        <div className="space-y-8">
          <DashboardKpiGrid items={kpiItems} />

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanel title="Headcount by department" subtitle="Active employees">
              <DonutChart segments={deptSegments} loading={false} emptyMessage="No employee records yet." />
            </DashboardPanel>
            <DashboardPanel title="Recent payroll runs" subtitle="Latest pay periods">
              {payrollRuns.length ? (
                <ul className="space-y-2 text-sm">
                  {payrollRuns.map((run) => (
                    <li
                      key={run.payroll_run_id ?? run.id}
                      className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800"
                    >
                      <span className="text-slate-700 dark:text-slate-200">
                        {run.period_label ?? run.pay_period ?? "Payroll run"}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {run.net_pay != null ? formatHrKesFull(run.net_pay) : run.status ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No payroll runs yet.</p>
              )}
            </DashboardPanel>
          </div>

          <DashboardSection
            title="Recent employees"
            action={
              <Link href="/hr/employees" className="text-sm text-[#185FA5] hover:underline">
                View all
              </Link>
            }
          >
            <DashboardSummaryTable
              columns={[
                { key: "name", label: "Employee" },
                { key: "department", label: "Department" },
                { key: "salary", label: "Base salary", align: "right" },
                { key: "status", label: "Status" },
              ]}
              rows={recentRows}
              formatValue={(key, value) => (key === "salary" ? formatHrKesFull(value) : value)}
              viewAllHref="/hr/employees"
            />
          </DashboardSection>

          <DashboardSection title="HR tools">
            <DashboardQuickLinks links={links} />
          </DashboardSection>
        </div>
      )}
    </CatalogPageShell>
  );
}
