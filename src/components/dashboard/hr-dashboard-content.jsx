"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { DonutChart, CHART_COLORS } from "@/components/reports/report-charts";

const HR_LINKS = [
  { href: "/hr/employees", title: "Employees", desc: "Staff records and contracts" },
  { href: "/hr/attendance", title: "Attendance", desc: "Clock-in and timesheets" },
  { href: "/hr/leave", title: "Leave & off days", desc: "Leave requests and balances" },
  { href: "/hr/payroll", title: "Payroll", desc: "Pay runs and payslips" },
  { href: "/hr/overtime", title: "Overtime", desc: "Overtime entries" },
  { href: "/hr/allowances", title: "Allowances", desc: "Recurring allowances" },
  { href: "/hr/deductions", title: "Deductions", desc: "Statutory and other deductions" },
  { href: "/reports/leave-balance", title: "Leave balance", desc: "Annual, sick, and off-day balances" },
  { href: "/reports/payroll-summary", title: "Payroll summary", desc: "Payroll runs summary" },
  { href: "/reports/statutory-deductions", title: "Statutory deductions", desc: "NSSF, SHIF, PAYE, and levies" },
  { href: "/reports/bank-transfer", title: "Bank transfer", desc: "Net pay bank payment file" },
  { href: "/reports/headcount", title: "Headcount", desc: "Workforce by department and branch" },
  { href: "/reports/contract-expiry", title: "Contract expiry", desc: "Upcoming contract end dates" },
  { href: "/reports/staff-turnover", title: "Staff turnover", desc: "Turnover rate by department" },
  { href: "/reports/hr-dashboard-kpi", title: "HR dashboard KPIs", desc: "Organization workforce metrics" },
];

export function HrDashboardContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);

  useEffect(() => {
    Promise.all([
      apiRequest("/employees", { searchParams: { per_page: 500 } }),
      apiRequest("/departments", { searchParams: { per_page: 200 } }),
      apiRequest("/reports/payroll-summary", { searchParams: { per_page: 5 } }).catch(() => ({ data: [] })),
    ])
      .then(([empRes, deptRes, payrollRes]) => {
        setEmployees(empRes.data ?? []);
        setDepartments(deptRes.data ?? []);
        setPayrollRuns(payrollRes.data ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load HR dashboard"))
      .finally(() => setLoading(false));
  }, []);

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.is_active !== false);
    const payrollCost = active.reduce((sum, e) => sum + Number(e.base_salary ?? 0), 0);
    return {
      total: employees.length,
      active: active.length,
      departments: departments.filter((d) => d.is_active !== false).length,
      payrollCost,
    };
  }, [employees, departments]);

  const deptSegments = useMemo(() => {
    const counts = new Map();
    for (const emp of employees.filter((e) => e.is_active !== false)) {
      const name = deptById.get(emp.department_id)?.department_name ?? "Unassigned";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], i) => ({
        label,
        value,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [employees, deptById]);

  const recentEmployees = useMemo(
    () =>
      [...employees]
        .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
        .slice(0, 6)
        .map((e) => ({
          id: e.id,
          name: composeEmployeeDisplayName(e),
          department: deptById.get(e.department_id)?.department_name ?? "—",
          salary: e.base_salary,
          status: e.is_active === false ? "Inactive" : "Active",
        })),
    [employees, deptById],
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
      title="HR & Payroll dashboard"
      subtitle="Workforce overview and payroll readiness"
      action={<PrimaryLink href="/hr/employees/new">Add employee</PrimaryLink>}
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
                    <li key={run.payroll_run_id ?? run.id} className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
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
              rows={recentEmployees}
              formatValue={(key, value) => (key === "salary" ? formatHrKesFull(value) : value)}
              viewAllHref="/hr/employees"
            />
          </DashboardSection>

          <DashboardSection title="HR tools">
            <DashboardQuickLinks links={HR_LINKS} />
          </DashboardSection>
        </div>
      )}
    </CatalogPageShell>
  );
}
