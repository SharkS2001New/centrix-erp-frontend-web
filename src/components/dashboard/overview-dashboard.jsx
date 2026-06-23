"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import {
  DashboardErrorBanner,
  DashboardQuickLinks,
  DashboardSection,
} from "@/components/dashboard/dashboard-shared";
import { ReportsDashboardSection } from "@/components/dashboard/reports-dashboard-section";

const MODULE_LINKS = [
  { key: "sales.backend", href: "/sales", title: "Sales", desc: "Orders and today's performance", permission: P.sales.dashboard.view },
  { key: "sales.pos", href: "/sales/pos", title: "Create Order", desc: "Search products, build a cart, and checkout", permission: P.pos.checkout.create },
  { key: "inventory", href: "/inventory", title: "Inventory", desc: "Stock levels, receipts, and movements", permission: P.inventory.stock.view },
  { key: "customers_suppliers", href: "/customers", title: "Customers", desc: "Debtors, routes, and credit", permission: P.customers.customers.view },
  { key: "customers_suppliers", href: "/suppliers", title: "Suppliers", desc: "Purchasing and payables", permission: P.purchasing.suppliers.view },
  { key: "sales.reports", href: "/reports", title: "Reports", desc: "Sales, inventory, and operations reports", permission: P.reports.hub.view },
];

export function OverviewDashboard() {
  const { user, capabilities, isModuleEnabled, hasPermission } = useAuth();
  const [dashError, setDashError] = useState(null);

  const enabledModules = useMemo(
    () => Object.entries(capabilities?.modules ?? {}).filter(([, on]) => on).map(([key]) => key),
    [capabilities?.modules],
  );

  const quickLinks = useMemo(
    () =>
      MODULE_LINKS.filter(
        (link) =>
          (!link.key || isModuleEnabled(link.key)) &&
          (!link.permission || hasPermission(link.permission)),
      ),
    [hasPermission, isModuleEnabled],
  );

  return (
    <CatalogPageShell
      title="Dashboard"
      subtitle={`Welcome back, ${user?.full_name ?? user?.username ?? "there"}`}
      action={
        hasPermission(P.reports.hub.view) ? (
          <Link
            href="/reports"
            className="inline-flex items-center theme-secondary-btn rounded-lg border px-4 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            All reports
          </Link>
        ) : null
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

      <ReportsDashboardSection workspaceScope="backoffice" onError={setDashError} />

      <DashboardSection title="Quick access" subtitle="Jump to a module dashboard" className="mt-8">
        <DashboardQuickLinks links={quickLinks} />
      </DashboardSection>
    </CatalogPageShell>
  );
}
