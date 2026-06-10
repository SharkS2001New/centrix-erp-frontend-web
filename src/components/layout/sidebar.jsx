"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

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
    label: "Finance",
    module: "accounting",
    items: [{ href: "/expenses", label: "Expenses", module: "accounting" }],
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
    label: "Sales",
    module: "sales.backend",
    items: [
      { href: "/sales", label: "Dashboard", module: "sales.backend", exact: true },
      { href: "/sales/pos", label: "Point of sale", module: "sales.backend" },
      { href: "/sales/orders", label: "Orders", module: "sales.backend" },
      { href: "/sales/vouchers", label: "Vouchers", module: "sales.backend" },
      { href: "/sales/loyalty-cards", label: "Loyalty cards", module: "sales.backend" },
      { href: "/sales/reservations", label: "Reservations", module: "sales.backend" },
      { href: "/sales/returns", label: "Returns", module: "sales.backend" },
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

  const visibleSections = navSections
    .filter((section) => !section.module || isModuleEnabled(section.module))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.module || isModuleEnabled(item.module),
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-5">
        <p className="text-sm font-semibold text-white">POS / ERP</p>
        <p className="mt-1 truncate text-xs text-slate-400">
          {capabilities?.profile_label ?? capabilities?.deployment_profile}
        </p>
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
        {visibleSections.map((section) => (
          <div key={section.label ?? "main"}>
            {section.label && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-emerald-600/20 text-emerald-300"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
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
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-xs text-slate-400">{user?.full_name ?? user?.username}</p>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
