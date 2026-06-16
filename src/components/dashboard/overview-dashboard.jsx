"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import {
  DashboardErrorBanner,
  DashboardLoading,
  DashboardQuickLinks,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { ReportsDashboardSection } from "@/components/dashboard/reports-dashboard-section";
import { formatReportKes } from "@/lib/reports/format";

const MODULE_LINKS = [
  { key: "sales.backend", href: "/sales", title: "Sales", desc: "Orders, POS, and today's performance" },
  { key: "sales.pos", href: "/sales/pos", title: "Point of sale", desc: "Checkout and till operations" },
  { key: "inventory", href: "/inventory", title: "Inventory", desc: "Stock levels, receipts, and movements" },
  { key: "customers_suppliers", href: "/customers", title: "Customers", desc: "Debtors, routes, and credit" },
  { key: "accounting", href: "/accounting", title: "Accounting", desc: "GL, P&L, and financial position" },
  { key: "reports", href: "/reports", title: "Reports", desc: "Operational and financial reports" },
  { key: "hr_payroll", href: "/hr", title: "HR & Payroll", desc: "Employees, attendance, and payroll" },
  { key: "admin", href: "/admin", title: "Administration", desc: "Users, branches, and settings" },
];

export function OverviewDashboard() {
  const { user, capabilities, isModuleEnabled } = useAuth();
  const [topDebtors, setTopDebtors] = useState([]);
  const [debtorsLoading, setDebtorsLoading] = useState(true);
  const [dashError, setDashError] = useState(null);

  const enabledModules = useMemo(
    () => Object.entries(capabilities?.modules ?? {}).filter(([, on]) => on).map(([key]) => key),
    [capabilities?.modules],
  );

  const quickLinks = useMemo(
    () => MODULE_LINKS.filter((link) => !link.key || isModuleEnabled(link.key)),
    [isModuleEnabled],
  );

  useEffect(() => {
    apiRequest("/reports/top-debtors", { searchParams: { per_page: 5 } })
      .then((res) => setTopDebtors(res.data ?? []))
      .catch(() => setTopDebtors([]))
      .finally(() => setDebtorsLoading(false));
  }, []);

  return (
    <CatalogPageShell
      title="Dashboard"
      subtitle={`Welcome back, ${user?.full_name ?? user?.username ?? "there"}`}
      action={
        <Link
          href="/reports"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          All reports
        </Link>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Organization</p>
          <p className="theme-heading mt-1 text-lg font-semibold">{user?.organization?.name ?? "—"}</p>
          <p className="theme-subtext mt-0.5 text-xs">{capabilities?.profile_label ?? capabilities?.deployment_profile}</p>
        </div>
        <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Branch</p>
          <p className="theme-heading mt-1 text-lg font-semibold">{user?.branch?.branch_name ?? "All branches"}</p>
          <p className="theme-subtext mt-0.5 text-xs">
            {(capabilities?.channels ?? []).join(" · ") || "Backoffice"}
          </p>
        </div>
        <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Enabled modules</p>
          <p className="theme-heading mt-1 text-lg font-semibold">{enabledModules.length}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {enabledModules.slice(0, 4).map((key) => (
              <span
                key={key}
                className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
              >
                {key.replace(/_/g, " ")}
              </span>
            ))}
            {enabledModules.length > 4 ? (
              <span className="text-[10px] text-slate-500">+{enabledModules.length - 4} more</span>
            ) : null}
          </div>
        </div>
      </div>

      <DashboardErrorBanner message={dashError} />

      <ReportsDashboardSection onError={setDashError} />

      <DashboardSection
        title="Top debtors"
        subtitle="Customers with the highest outstanding balances"
        className="mt-8"
        action={
          <Link href="/reports/top-debtors" className="text-sm font-medium text-[#185FA5] hover:underline">
            Full report
          </Link>
        }
      >
        {debtorsLoading ? (
          <DashboardLoading label="Loading receivables…" />
        ) : (
          <DashboardSummaryTable
            columns={[
              { key: "customer_name", label: "Customer" },
              { key: "route_name", label: "Route" },
              { key: "total_outstanding", label: "Outstanding", align: "right" },
            ]}
            rows={topDebtors}
            formatValue={(key, value) => (key === "total_outstanding" ? formatReportKes(value) : value)}
            viewAllHref="/reports/top-debtors"
            viewAllLabel="View top debtors report →"
          />
        )}
      </DashboardSection>

      <DashboardSection title="Quick access" subtitle="Jump to a module dashboard" className="mt-8">
        <DashboardQuickLinks links={quickLinks} />
      </DashboardSection>
    </CatalogPageShell>
  );
}
