import { FEATURED_REPORT_KEYS, REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { P, reportPermissionCode } from "@/lib/permission-codes";

function reportNavLabel(key) {
  const title = REPORT_DEFINITIONS[key]?.title ?? key;
  return title.replace(/ Report$/i, "");
}

function buildReportNavItems() {
  return [
    { href: "/reports", label: "All reports", module: "reports", permission: P.reports.hub.view, exact: true },
    ...FEATURED_REPORT_KEYS.map((key) => ({
      href: `/reports/${key}`,
      label: reportNavLabel(key),
      module: "reports",
      permission: reportPermissionCode(key),
    })),
    {
      href: "/reports/customer-statement",
      label: "Customer statement",
      module: "reports",
      permission: P.reports.customer_statement.view,
    },
  ];
}

/** @typedef {{ href: string, label: string, module?: string | null, permission?: string, exact?: boolean, ordersNav?: boolean, requireTillFloat?: boolean, requireAdmin?: boolean, superAdminOnly?: boolean }} NavItem */

/** @typedef {{ id: string, label?: string, module?: string | null, collapsible?: boolean, superAdminOnly?: boolean, items: NavItem[] }} NavSection */

/** @type {NavSection[]} */
export const navSections = [
  {
    id: "platform",
    label: "Platform",
    superAdminOnly: true,
    collapsible: true,
    items: [
      { href: "/platform", label: "Overview", exact: true, superAdminOnly: true },
      { href: "/admin/organizations/new", label: "Provision organization", superAdminOnly: true },
    ],
  },
  {
    id: "overview",
    items: [{ href: "/dashboard", label: "Dashboard", module: null, permission: P.dashboard.overview.view }],
  },
  {
    id: "catalog",
    label: "Catalog",
    collapsible: true,
    items: [
      { href: "/products", label: "Products", module: null, permission: P.catalogue.products.view },
      { href: "/categories", label: "Categories", module: null, permission: P.catalogue.categories.view },
      { href: "/uoms", label: "Units of measure", module: null, permission: P.catalogue.uoms.view },
      {
        href: "/retail-package-settings",
        label: "Retail packages",
        module: null,
        permission: P.catalogue.retail_packages.view,
      },
      { href: "/vats", label: "VAT rates", module: null, permission: P.catalogue.vat_rates.view },
      { href: "/price-history", label: "Price history", module: null, permission: P.catalogue.price_history.view },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    module: "customers_suppliers",
    collapsible: true,
    items: [{ href: "/customers", label: "Customers", module: "customers_suppliers", permission: P.customers.customers.view }],
  },
  {
    id: "sales",
    label: "Sales",
    module: "sales.backend",
    collapsible: true,
    items: [
      { href: "/sales", label: "Dashboard", module: "sales.backend", permission: P.sales.dashboard.view, exact: true },
      { href: "/sales/orders", label: "Orders", module: "sales.backend", permission: P.sales.orders.view, ordersNav: true },
      { href: "/sales/vouchers", label: "Vouchers", module: "sales.backend", permission: P.sales.vouchers.view },
      { href: "/sales/loyalty-cards", label: "Loyalty cards", module: "sales.backend", permission: P.sales.loyalty_cards.view },
      { href: "/sales/reservations", label: "Reservations", module: "sales.backend", permission: P.sales.reservations.view },
      { href: "/sales/returns", label: "Returns", module: "sales.backend", permission: P.sales.returns.view },
      {
        href: "/sales/returns/new",
        label: "Create return",
        module: "sales.backend",
        permission: P.sales.returns.create,
        exact: true,
      },
    ],
  },
  {
    id: "pos",
    label: "POS",
    module: "sales.pos",
    collapsible: true,
    items: [
      {
        href: "/sales/till-management",
        label: "Till Management",
        module: "sales.pos",
        permission: P.pos.till_management.view,
        requireTillFloat: true,
      },
      { href: "/sales/pos", label: "Point of sale", module: "sales.pos", permission: P.pos.checkout.create },
      { href: "/sales/end-of-day", label: "End of day report", module: "sales.pos", permission: P.pos.end_of_day.view },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    module: "inventory",
    collapsible: true,
    items: [
      { href: "/inventory/stock", label: "Current stock", module: "inventory", permission: P.inventory.stock.view },
      { href: "/inventory/receipts", label: "Stock receipts", module: "inventory", permission: P.inventory.receipts.view },
      { href: "/inventory/transactions", label: "Movements", module: "inventory", permission: P.inventory.movements.view },
      {
        href: "/inventory/transfers/new",
        label: "Transfer stock",
        module: "inventory",
        permission: P.inventory.transfers.create,
      },
      { href: "/inventory/damages", label: "Damages", module: "inventory", permission: P.inventory.damages.view },
      { href: "/inventory/stock-take", label: "Stock take", module: "inventory", permission: P.inventory.stock_take.view },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    module: "customers_suppliers",
    collapsible: true,
    items: [
      { href: "/lpo", label: "Purchase orders", module: "customers_suppliers", permission: P.purchasing.lpo.view },
      { href: "/suppliers", label: "Suppliers", module: "customers_suppliers", permission: P.purchasing.suppliers.view },
      {
        href: "/suppliers/payments",
        label: "Supplier payments",
        module: "customers_suppliers",
        permission: P.purchasing.supplier_payments.view,
      },
      {
        href: "/suppliers/returns",
        label: "Supplier returns",
        module: "customers_suppliers",
        permission: P.purchasing.supplier_returns.view,
      },
    ],
  },
  {
    id: "fulfillment",
    label: "Fulfillment",
    module: "customers_suppliers",
    collapsible: true,
    items: [
      { href: "/fulfillment/drivers", label: "Drivers", module: "customers_suppliers", permission: P.fulfillment.drivers.view },
      { href: "/fulfillment/vehicles", label: "Vehicles", module: "customers_suppliers", permission: P.fulfillment.vehicles.view },
      { href: "/fulfillment/routes", label: "Routes", module: "customers_suppliers", permission: P.fulfillment.routes.view },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    module: "accounting",
    collapsible: true,
    items: [
      { href: "/accounting", label: "Dashboard", module: "accounting", permission: P.accounting.dashboard.view, exact: true },
      {
        href: "/accounting/chart-of-accounts",
        label: "Chart of Accounts",
        module: "accounting",
        permission: P.accounting.chart_of_accounts.view,
      },
      {
        href: "/accounting/journal-entries",
        label: "Journal Entries",
        module: "accounting",
        permission: P.accounting.journal_entries.view,
      },
      {
        href: "/accounting/fiscal-periods",
        label: "Fiscal Periods",
        module: "accounting",
        permission: P.accounting.fiscal_periods.view,
      },
      { href: "/accounting/settings", label: "Settings", module: "accounting", permission: P.accounting.settings.view },
      {
        href: "/accounting/account-mappings",
        label: "Account Mappings",
        module: "accounting",
        permission: P.accounting.account_mappings.view,
      },
      {
        href: "/accounting/export-queue",
        label: "Export Queue",
        module: "accounting",
        permission: P.accounting.export_queue.view,
      },
      {
        href: "/accounting/general-ledger",
        label: "General Ledger",
        module: "accounting",
        permission: P.accounting.general_ledger.view,
      },
      {
        href: "/accounting/trial-balance",
        label: "Trial Balance",
        module: "accounting",
        permission: P.accounting.trial_balance.view,
      },
      { href: "/accounting/profit-loss", label: "Profit & Loss", module: "accounting", permission: P.accounting.profit_loss.view },
      {
        href: "/accounting/balance-sheet",
        label: "Balance Sheet",
        module: "accounting",
        permission: P.accounting.balance_sheet.view,
      },
      { href: "/accounting/cash-flow", label: "Cash Flow", module: "accounting", permission: P.accounting.cash_flow.view },
      {
        href: "/accounting/accounts-receivable",
        label: "Accounts Receivable",
        module: "accounting",
        permission: P.accounting.accounts_receivable.view,
      },
      {
        href: "/accounting/accounts-payable",
        label: "Accounts Payable",
        module: "accounting",
        permission: P.accounting.accounts_payable.view,
      },
      { href: "/expenses", label: "Expenses", module: "accounting", permission: P.accounting.expenses.view },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    module: "reports",
    collapsible: true,
    items: buildReportNavItems(),
  },
  {
    id: "hr",
    label: "HR & Payroll",
    module: "hr_payroll",
    collapsible: true,
    items: [
      { href: "/hr/employees", label: "Employees", module: "hr_payroll", permission: P.hr.employees.view },
      { href: "/hr/positions", label: "Positions", module: "hr_payroll", permission: P.hr.positions.view },
      { href: "/hr/shifts", label: "Shifts", module: "hr_payroll", permission: P.hr.shifts.view },
      { href: "/hr/allowances", label: "Allowances", module: "hr_payroll", permission: P.hr.allowances.view },
      { href: "/hr/deductions", label: "Deductions", module: "hr_payroll", permission: P.hr.deductions.view },
      { href: "/hr/overtime", label: "Overtime", module: "hr_payroll", permission: P.hr.overtime.view },
      { href: "/hr/cash-advances", label: "Cash advances", module: "hr_payroll", permission: P.hr.cash_advances.view },
      { href: "/hr/attendance", label: "Attendance", module: "hr_payroll", permission: P.hr.attendance.view },
      { href: "/hr/leave", label: "Leave & off days", module: "hr_payroll", permission: P.hr.leave.view },
      { href: "/hr/payroll", label: "Payroll", module: "hr_payroll", permission: P.hr.payroll.view },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    module: "admin",
    collapsible: true,
    items: [
      { href: "/admin", label: "Overview", module: "admin", permission: P.admin.overview.view, exact: true },
      { href: "/admin/company", label: "Company profile", module: "admin", permission: P.admin.company.view },
      { href: "/admin/branches", label: "Branches", module: "admin", permission: P.admin.branches.view },
      { href: "/admin/users", label: "Users", module: "admin", permission: P.admin.users.view, requireAdmin: true },
      { href: "/admin/roles", label: "Roles & permissions", module: "admin", permission: P.admin.roles.view },
      { href: "/admin/audit", label: "Audit trail", module: "admin", permission: P.admin.audit.view },
      { href: "/admin/settings", label: "System settings", module: "admin", permission: P.admin.settings.view },
    ],
  },
];

export function isNavItemActive(item, pathname) {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isNavSectionActive(section, pathname) {
  return section.items.some((item) => isNavItemActive(item, pathname));
}

export function isNavItemVisible(item, { isModuleEnabled, hasPermission, requireTillFloat, user, capabilities, isSuperAdmin }) {
  if (item.superAdminOnly && !isSuperAdmin?.()) return false;
  if (item.requireTillFloat && !requireTillFloat) return false;
  if (item.requireAdmin && !user?.is_admin && !capabilities?.is_admin) return false;
  if (item.module && !isModuleEnabled(item.module)) return false;
  if (item.permission && !hasPermission(item.permission)) return false;
  return true;
}
