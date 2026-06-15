"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getSalesOrderQueueWorkflow, salesOrderQueueNavItems } from "@/lib/order-workflow";
import { isMobileOrdersEnabled, isPosTillFloatRequired } from "@/lib/sales-settings";

const navSections = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", module: null },
      { href: "/customers", label: "Customers", module: "customers_suppliers" },
      { href: "/products", label: "Products", module: null },
      { href: "/categories", label: "Categories", module: null },
      { href: "/uoms", label: "Units of measure", module: null },
      { href: "/retail-package-settings", label: "Retail packages", module: null },
      { href: "/vats", label: "VAT rates", module: null },
      { href: "/price-history", label: "Price history", module: null },
      { href: "/reports", label: "Reports", module: "reports" },
    ],
  },
  {
    label: "Inventory",
    module: "inventory",
    items: [
      { href: "/inventory/stock", label: "Current stock", module: "inventory" },
      { href: "/inventory/receipts", label: "Stock receipts", module: "inventory" },
      { href: "/inventory/transactions", label: "Movements", module: "inventory" },
      { href: "/inventory/transfers/new", label: "Transfer stock", module: "inventory" },
      { href: "/inventory/damages", label: "Damages", module: "inventory" },
      { href: "/inventory/stock-take", label: "Stock take", module: "inventory" },
    ],
  },
  {
    label: "Accounting",
    module: "accounting",
    items: [
      { href: "/accounting", label: "Dashboard", module: "accounting", exact: true },
      { href: "/accounting/chart-of-accounts", label: "Chart of Accounts", module: "accounting" },
      { href: "/accounting/journal-entries", label: "Journal Entries", module: "accounting" },
      { href: "/accounting/general-ledger", label: "General Ledger", module: "accounting" },
      { href: "/accounting/trial-balance", label: "Trial Balance", module: "accounting" },
      { href: "/accounting/profit-loss", label: "Profit & Loss", module: "accounting" },
      { href: "/accounting/balance-sheet", label: "Balance Sheet", module: "accounting" },
      { href: "/accounting/cash-flow", label: "Cash Flow", module: "accounting" },
      { href: "/accounting/accounts-receivable", label: "Accounts Receivable", module: "accounting" },
      { href: "/accounting/accounts-payable", label: "Accounts Payable", module: "accounting" },
      { href: "/expenses", label: "Expenses", module: "accounting" },
      { href: "/admin/settings", label: "Settings", module: "admin" },
    ],
  },
  {
    label: "HR & Payroll",
    module: "hr_payroll",
    items: [
      { href: "/hr/employees", label: "Employees", module: "hr_payroll" },
      { href: "/hr/positions", label: "Positions", module: "hr_payroll" },
      { href: "/hr/shifts", label: "Shifts", module: "hr_payroll" },
      { href: "/hr/allowances", label: "Allowances", module: "hr_payroll" },
      { href: "/hr/deductions", label: "Deductions", module: "hr_payroll" },
      { href: "/hr/overtime", label: "Overtime", module: "hr_payroll" },
      { href: "/hr/cash-advances", label: "Cash advances", module: "hr_payroll" },
      { href: "/hr/attendance", label: "Attendance", module: "hr_payroll" },
      { href: "/hr/leave", label: "Leave & off days", module: "hr_payroll" },
      { href: "/hr/payroll", label: "Payroll", module: "hr_payroll" },
    ],
  },
  {
    label: "POS",
    module: "sales.backend",
    items: [
      { href: "/sales/till-management", label: "Till Management", module: "sales.backend", requireTillFloat: true },
      { href: "/sales/pos", label: "Point of sale", module: "sales.backend" },
      { href: "/sales/end-of-day", label: "End of day report", module: "sales.backend" },
    ],
  },
  {
    label: "Sales",
    module: "sales.backend",
    items: [
      { href: "/sales", label: "Dashboard", module: "sales.backend", exact: true },
      { href: "/sales/orders", label: "Orders", module: "sales.backend", ordersNav: true },
      { href: "/sales/vouchers", label: "Vouchers", module: "sales.backend" },
      { href: "/sales/loyalty-cards", label: "Loyalty cards", module: "sales.backend" },
      { href: "/sales/reservations", label: "Reservations", module: "sales.backend" },
      { href: "/sales/returns", label: "Returns", module: "sales.backend" },
      { href: "/sales/returns/new", label: "Create return", module: "sales.backend", exact: true },
    ],
  },
  {
    label: "Suppliers",
    module: "customers_suppliers",
    items: [
      { href: "/lpo", label: "Purchase orders", module: "customers_suppliers" },
      { href: "/suppliers", label: "Suppliers", module: "customers_suppliers" },
      { href: "/suppliers/payments", label: "Supplier payments", module: "customers_suppliers" },
      { href: "/suppliers/returns", label: "Supplier returns", module: "customers_suppliers" },
    ],
  },
  {
    label: "Fulfillment",
    module: "customers_suppliers",
    items: [
      { href: "/fulfillment/drivers", label: "Drivers", module: null },
      { href: "/fulfillment/vehicles", label: "Vehicles", module: null },
      { href: "/fulfillment/routes", label: "Routes", module: "customers_suppliers" },
    ],
  },
  {
    label: "Administration",
    module: "admin",
    items: [
      { href: "/admin", label: "Overview", module: "admin", exact: true },
      { href: "/admin/company", label: "Company profile", module: "admin" },
      { href: "/admin/branches", label: "Branches", module: "admin" },
      { href: "/admin/users", label: "Users", module: "admin" },
      { href: "/admin/roles", label: "Roles & permissions", module: "admin" },
      { href: "/admin/audit", label: "Audit trail", module: "admin" },
      { href: "/admin/settings", label: "System settings", module: "admin" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, capabilities, logout, isModuleEnabled } = useAuth();

  const requireTillFloat = isPosTillFloatRequired(capabilities?.module_settings);

  const salesOrderNavItems = useMemo(() => {
    const workflow = getSalesOrderQueueWorkflow(capabilities, "backend");
    const includeMobile = isMobileOrdersEnabled(capabilities?.module_settings);
    return salesOrderQueueNavItems(workflow, { includeMobile }).map((item) => ({
      href: item.href,
      label: item.label,
      module: "sales.backend",
      exact: item.slug === "all",
    }));
  }, [capabilities]);

  const visibleSections = navSections
    .filter((section) => !section.module || isModuleEnabled(section.module))
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        if (item.ordersNav) return salesOrderNavItems;
        if (item.requireTillFloat && !requireTillFloat) return [];
        if (!item.module || isModuleEnabled(item.module)) return [item];
        return [];
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="app-sidebar flex h-full min-h-0 w-56 shrink-0 flex-col border-r">
      <OrganizationSwitcher />
      <div className="app-sidebar-divider border-b px-4 py-3">
        <p className="app-sidebar-title text-sm font-semibold">POS / ERP</p>
        <p className="app-sidebar-muted mt-1 truncate text-xs">
          {capabilities?.profile_label ?? capabilities?.deployment_profile}
        </p>
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        {visibleSections.map((section) => (
          <div key={section.label ?? "main"}>
            {section.label && (
              <p className="app-sidebar-section-label mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`app-sidebar-link block rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "app-sidebar-link-active" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="app-sidebar-divider border-t p-4">
        <p className="app-sidebar-muted truncate text-xs">{user?.full_name ?? user?.username}</p>
        <div className="mt-2 flex gap-2">
          <Link
            href="/profile"
            className="app-sidebar-btn flex-1 rounded-lg border px-3 py-1.5 text-center text-xs transition"
          >
            Profile
          </Link>
          <ThemeToggle className="shrink-0" />
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="app-sidebar-btn mt-2 w-full rounded-lg border px-3 py-1.5 text-xs transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
