import { FEATURED_REPORT_KEYS, REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { HR_REPORT_DEFS } from "@/lib/reports/hr-reports";
import { canViewReport, P, reportPermissionCode } from "@/lib/permission-codes";
import { shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";
import { reportModuleForSlug, anyReportsModuleEnabled } from "@/lib/module-registry";
import { shouldShowMobileLoadingSheets, shouldShowMobileFieldAttendance } from "@/lib/sales-settings";

function backofficeFinanceReportNavItems(group) {
  return [
    {
      href: "/reports/profit-loss",
      label: "Profit & loss",
      moduleAny: ["sales.reports", "accounting.reports"],
      permission: P.reports.profit_loss.view,
      reportKey: "profit-loss",
      group,
    },
    {
      href: "/reports/top-debtors",
      label: "Top debtors",
      moduleAny: ["sales.reports", "accounting.reports"],
      permission: P.reports.top_debtors.view,
      reportKey: "top-debtors",
      group,
    },
    {
      href: "/reports/ar-aging",
      label: "AR aging",
      moduleAny: ["sales.reports", "accounting.reports"],
      permission: P.reports.hub.view,
      reportKey: "ar-aging",
      group,
    },
    {
      href: "/reports/expenses",
      label: "Expenses",
      moduleAny: ["sales.reports", "accounting.reports"],
      permission: P.reports.expenses.view,
      reportKey: "expenses",
      group,
    },
    {
      href: "/reports/invoice-payments",
      label: "Invoice payments",
      moduleAny: ["sales.reports", "accounting.reports"],
      permission: P.reports.hub.view,
      reportKey: "invoice-payments",
      group,
    },
    {
      href: "/reports/kra-receipts",
      label: "KRA receipts",
      moduleAny: ["sales.reports", "accounting.reports"],
      permission: P.reports.hub.view,
      reportKey: "kra-receipts",
      group,
    },
  ];
}

function reportNavLabel(key) {
  const title = REPORT_DEFINITIONS[key]?.title ?? key;
  return title.replace(/ Report$/i, "");
}

const REPORT_GROUP_MAP = {
  Sales: "Sales Reports",
  Inventory: "Inventory Reports",
  Finance: "Financial Reports",
  Operations: "Operations Reports",
  HR: "HR Reports",
};

function buildReportNavItems() {
  const items = [
    {
      href: "/reports",
      label: "All reports",
      module: null,
      permission: P.reports.hub.view,
      exact: true,
      group: "Overview",
      requireAnyReportsModule: true,
    },
    {
      href: "/reports/builder",
      label: "Report builder",
      module: null,
      permission: P.reports.builder.view,
      group: "Custom Reports",
      requireAnyReportsModule: true,
    },
    {
      href: "/reports/customer-statement",
      label: "Customer statement",
      module: "accounting.reports",
      permission: P.reports.customer_statement.view,
      group: "Custom Reports",
    },
  ];

  for (const key of FEATURED_REPORT_KEYS) {
    const section = REPORT_DEFINITIONS[key]?.section ?? "Finance";
    items.push({
      href: `/reports/${key}`,
      label: reportNavLabel(key),
      module: reportModuleForSlug(key),
      permission: reportPermissionCode(key),
      reportKey: key,
      group: REPORT_GROUP_MAP[section] ?? "Financial Reports",
    });
  }

  for (const report of HR_REPORT_DEFS) {
    items.push({
      href: `/reports/${report.key}`,
      label: report.label,
      module: "hr_payroll.reports",
      permission: reportPermissionCode(report.key),
      reportKey: report.key,
      group: "HR Reports",
    });
  }

  return items;
}

/** @typedef {{ href: string, label: string, module?: string | null, permission?: string, exact?: boolean, ordersNav?: boolean, requireTillFloat?: boolean, requireAdmin?: boolean, superAdminOnly?: boolean, orgAdminOnly?: boolean, group?: string, reportKey?: string }} NavItem */

/** @typedef {{ id: string, label?: string, icon?: string, module?: string | null, collapsible?: boolean, superAdminOnly?: boolean, items: NavItem[] }} NavSection */

/** @type {NavSection[]} */
export const navSections = [
  {
    id: "platform",
    label: "Platform",
    icon: "🌐",
    superAdminOnly: true,
    collapsible: true,
    items: [
      { href: "/platform", label: "Overview", exact: true, superAdminOnly: true },
      { href: "/platform/organizations/new", label: "Register organization", superAdminOnly: true },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "📊",
    collapsible: true,
    items: [
      {
        href: "/dashboard",
        label: "Overview",
        module: null,
        permission: P.dashboard.overview.view,
        exact: true,
      },
      {
        href: "/sales",
        label: "Sales",
        module: "sales.dashboard",
        permission: P.sales.dashboard.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/inventory",
        label: "Inventory",
        module: "inventory.dashboard",
        permission: P.inventory.stock.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/accounting",
        label: "Accounting",
        module: "accounting.dashboard",
        permission: P.accounting.dashboard.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/hr",
        label: "Human resources",
        module: "hr_payroll.dashboard",
        permission: P.hr.employees.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/fulfillment",
        label: "Logistics",
        module: "distribution.dashboard",
        permission: P.fulfillment.drivers.view,
        group: "Analytics",
        exact: true,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: "🛒",
    collapsible: true,
    items: [
      {
        href: "/sales/pos",
        label: "Create order",
        module: "sales.pos",
        permission: P.pos.checkout.create,
        group: "Sales POS",
      },
      {
        href: "/sales/till-management",
        label: "Till management",
        module: "sales.pos",
        permission: P.pos.till_management.view,
        requireTillFloat: true,
        group: "POS",
      },
      {
        href: "/sales/end-of-day",
        label: "End of day",
        module: "sales.pos",
        permission: P.pos.end_of_day.view,
        group: "POS",
      },
      { href: "/sales/orders", label: "All orders", module: "sales.backend", permission: P.sales.orders.view, ordersNav: true },
      {
        href: "/sales/loading-sheets",
        label: "Loading sheets",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireMobileLoadingSheets: true,
        group: "Sales orders",
      },
      {
        href: "/sales/field-attendance",
        label: "Field attendance",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireMobileFieldAttendance: true,
        group: "Sales orders",
      },
      {
        href: "/sales/vouchers",
        label: "Vouchers",
        module: "sales.backend",
        permission: P.sales.vouchers.view,
        group: "Sales",
      },
      {
        href: "/sales/loyalty-cards",
        label: "Loyalty cards",
        module: "sales.backend",
        permission: P.sales.loyalty_cards.view,
        group: "Sales",
      },
      {
        href: "/sales/reservations",
        label: "Reservations",
        module: "sales.backend",
        permission: P.sales.reservations.view,
        group: "Sales",
      },
      {
        href: "/sales/returns",
        label: "Credit notes",
        module: "sales.backend",
        permission: P.sales.returns.view,
        group: "Credit notes",
      },
      {
        href: "/reports/daily-sales",
        label: "Daily sales report",
        module: "sales.reports",
        permission: P.reports.daily_sales.view,
        reportKey: "daily-sales",
        group: "Sales reports",
      },
      {
        href: "/reports/till-sessions",
        label: "Till sessions report",
        module: "sales.reports",
        permission: P.reports.till_sessions.view,
        reportKey: "till-sessions",
        group: "Sales reports",
      },
      {
        href: "/customers",
        label: "Customers",
        module: "customers_suppliers",
        permission: P.customers.customers.view,
        group: "Customers",
      },
      ...backofficeFinanceReportNavItems("Finance & compliance"),
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "📦",
    collapsible: true,
    items: [
      {
        href: "/products",
        label: "Products",
        module: null,
        permission: P.catalogue.products.view,
        group: "Catalog",
      },
      {
        href: "/categories",
        label: "Categories",
        module: null,
        permission: P.catalogue.categories.view,
        group: "Catalog",
      },
      {
        href: "/uoms",
        label: "Units of measure",
        module: null,
        permission: P.catalogue.uoms.view,
        group: "Catalog",
      },
      {
        href: "/retail-package-settings",
        label: "Retail packages",
        module: null,
        permission: P.catalogue.retail_packages.view,
        group: "Catalog",
      },
      {
        href: "/vats",
        label: "VAT rates",
        module: null,
        permission: P.catalogue.vat_rates.view,
        group: "Catalog",
      },
      {
        href: "/price-history",
        label: "Price history",
        module: null,
        permission: P.catalogue.price_history.view,
        group: "Catalog",
      },
      {
        href: "/inventory/stock",
        label: "Current stock",
        module: "inventory",
        permission: P.inventory.stock.view,
        group: "Stock",
      },
      {
        href: "/inventory/damages",
        label: "Stock adjustments",
        module: "inventory",
        permission: P.inventory.damages.view,
        group: "Stock",
      },
      {
        href: "/inventory/transfers",
        label: "Transfer history",
        module: "inventory",
        permission: P.inventory.transfers.view,
        group: "Stock",
      },
      {
        href: "/inventory/transfers/new",
        label: "New transfer",
        module: "inventory",
        permission: P.inventory.transfers.create,
        group: "Stock",
      },
      {
        href: "/inventory/stock-take",
        label: "Stock take",
        module: "inventory",
        permission: P.inventory.stock_take.view,
        group: "Stock",
      },
      {
        href: "/inventory/transactions",
        label: "Movements",
        module: "inventory",
        permission: P.inventory.movements.view,
        group: "Stock",
      },
      {
        href: "/reports/stock-on-hand",
        label: "Stock on hand",
        module: "inventory.reports",
        permission: P.reports.stock_on_hand.view,
        reportKey: "stock-on-hand",
        group: "Stock reports",
      },
      {
        href: "/reports/stock-movement",
        label: "Stock movement",
        module: "inventory.reports",
        permission: P.reports.stock_movement.view,
        reportKey: "stock-movement",
        group: "Stock reports",
      },
    ],
  },
  {
    id: "purchases",
    label: "Purchases",
    icon: "🚚",
    collapsible: true,
    items: [
      {
        href: "/suppliers",
        label: "Suppliers",
        module: "customers_suppliers",
        permission: P.purchasing.suppliers.view,
        group: "Suppliers",
      },
      {
        href: "/lpo",
        label: "Purchase orders",
        module: "customers_suppliers",
        permission: P.purchasing.lpo.view,
        group: "Purchasing",
      },
      {
        href: "/inventory/receipts",
        label: "Goods received (GRN)",
        module: "inventory",
        permission: P.inventory.receipts.view,
        group: "Purchasing",
      },
      {
        href: "/suppliers/payments",
        label: "Supplier payments",
        module: "customers_suppliers",
        permission: P.purchasing.supplier_payments.view,
        group: "Purchasing",
      },
      {
        href: "/suppliers/returns",
        label: "Returns",
        module: "customers_suppliers",
        permission: P.purchasing.supplier_returns.view,
        group: "Purchasing",
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    icon: "💰",
    collapsible: true,
    items: [
      {
        href: "/accounting/chart-of-accounts",
        label: "Chart of accounts",
        module: "accounting",
        permission: P.accounting.chart_of_accounts.view,
      },
      {
        href: "/accounting/journal-entries",
        label: "Journal entries",
        module: "accounting",
        permission: P.accounting.journal_entries.view,
      },
      {
        href: "/accounting/general-ledger",
        label: "General ledger",
        module: "accounting",
        permission: P.accounting.general_ledger.view,
      },
      {
        href: "/accounting/accounts-receivable",
        label: "Accounts receivable",
        module: "accounting",
        permission: P.accounting.accounts_receivable.view,
      },
      {
        href: "/accounting/customer-invoices",
        label: "Customer invoices",
        module: "payments",
        permission: P.payments.customer_invoices.view,
      },
      {
        href: "/accounting/accounts-payable",
        label: "Accounts payable",
        module: "accounting",
        permission: P.accounting.accounts_payable.view,
      },
      {
        href: "/expenses",
        label: "Expenses",
        module: "accounting",
        permission: P.accounting.expenses.view,
      },
      {
        href: "/accounting/trial-balance",
        label: "Trial balance",
        module: "accounting",
        permission: P.accounting.trial_balance.view,
        group: "Financial statements",
      },
      {
        href: "/accounting/balance-sheet",
        label: "Balance sheet",
        module: "accounting",
        permission: P.accounting.balance_sheet.view,
        group: "Financial statements",
      },
      {
        href: "/accounting/profit-loss",
        label: "Profit & loss",
        module: "accounting",
        permission: P.accounting.profit_loss.view,
        group: "Financial statements",
      },
      {
        href: "/accounting/cash-flow",
        label: "Cash flow",
        module: "accounting",
        permission: P.accounting.cash_flow.view,
        group: "Financial statements",
      },
      {
        href: "/accounting/fiscal-periods",
        label: "Fiscal periods",
        module: "accounting",
        permission: P.accounting.fiscal_periods.view,
        group: "Setup",
      },
      {
        href: "/accounting/account-mappings",
        label: "Account mappings",
        module: "accounting",
        permission: P.accounting.account_mappings.view,
        group: "Setup",
      },
      {
        href: "/accounting/export-queue",
        label: "Export queue",
        module: "accounting",
        permission: P.accounting.export_queue.view,
        group: "Setup",
      },
      {
        href: "/accounting/settings",
        label: "Accounting settings",
        module: "accounting",
        permission: P.accounting.settings.view,
        group: "Setup",
      },
      {
        href: "/vats",
        label: "Tax settings",
        module: null,
        permission: P.catalogue.vat_rates.view,
        group: "Tax & compliance",
      },
      {
        href: "/reports/kra-receipts",
        label: "KRA receipts",
        moduleAny: ["sales.reports", "accounting.reports"],
        permission: P.reports.hub.view,
        reportKey: "kra-receipts",
        group: "Tax & compliance",
      },
      {
        href: "/reports/profit-loss",
        label: "Profit & loss (operational)",
        moduleAny: ["sales.reports", "accounting.reports"],
        permission: P.reports.profit_loss.view,
        reportKey: "profit-loss",
        group: "Operational reports",
      },
      {
        href: "/reports/top-debtors",
        label: "Top debtors",
        moduleAny: ["sales.reports", "accounting.reports"],
        permission: P.reports.top_debtors.view,
        reportKey: "top-debtors",
        group: "Operational reports",
      },
      {
        href: "/reports/ar-aging",
        label: "AR aging",
        moduleAny: ["sales.reports", "accounting.reports"],
        permission: P.reports.hub.view,
        reportKey: "ar-aging",
        group: "Operational reports",
      },
      {
        href: "/reports/expenses",
        label: "Expenses report",
        moduleAny: ["sales.reports", "accounting.reports"],
        permission: P.reports.expenses.view,
        reportKey: "expenses",
        group: "Operational reports",
      },
      {
        href: "/reports/invoice-payments",
        label: "Invoice payments",
        moduleAny: ["sales.reports", "accounting.reports"],
        permission: P.reports.hub.view,
        reportKey: "invoice-payments",
        group: "Operational reports",
      },
    ],
  },
  {
    id: "hr",
    label: "Human resources",
    icon: "👥",
    collapsible: true,
    items: [
      {
        href: "/hr/employees",
        label: "Employees",
        module: "hr_payroll",
        permission: P.hr.employees.view,
      },
      {
        href: "/hr/departments",
        label: "Departments",
        module: "hr_payroll",
        permission: P.hr.departments.view,
      },
      {
        href: "/hr/positions",
        label: "Designations",
        module: "hr_payroll",
        permission: P.hr.positions.view,
      },
      {
        href: "/hr/kpis",
        label: "Employee KPIs",
        module: "hr_payroll",
        permission: P.hr.kpis.view,
      },
      {
        href: "/hr/attendance",
        label: "Attendance",
        module: "hr_payroll",
        permission: P.hr.attendance.view,
      },
      {
        href: "/hr/leave",
        label: "Leave management",
        module: "hr_payroll",
        permission: P.hr.leave.view,
      },
      {
        href: "/hr/payroll",
        label: "Payroll",
        module: "hr_payroll",
        permission: P.hr.payroll.view,
      },
      {
        href: "/hr/shifts",
        label: "Shifts",
        module: "hr_payroll",
        permission: P.hr.shifts.view,
        group: "Benefits & pay",
      },
      {
        href: "/hr/allowances",
        label: "Allowances",
        module: "hr_payroll",
        permission: P.hr.allowances.view,
        group: "Benefits & pay",
      },
      {
        href: "/hr/deductions",
        label: "Deductions",
        module: "hr_payroll",
        permission: P.hr.deductions.view,
        group: "Benefits & pay",
      },
      {
        href: "/hr/overtime",
        label: "Overtime",
        module: "hr_payroll",
        permission: P.hr.overtime.view,
        group: "Benefits & pay",
      },
      {
        href: "/hr/cash-advances",
        label: "Cash advances",
        module: "hr_payroll",
        permission: P.hr.cash_advances.view,
        group: "Benefits & pay",
      },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    icon: "🚛",
    collapsible: true,
    items: [
      {
        href: "/fulfillment/dispatch",
        label: "Dispatch",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
      },
      {
        href: "/fulfillment/trips",
        label: "Shipment tracking",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
      },
      {
        href: "/fulfillment/pod-records",
        label: "Deliveries",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
      },
      {
        href: "/fulfillment/drivers",
        label: "Drivers",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
        group: "Fleet management",
      },
      {
        href: "/fulfillment/vehicles",
        label: "Vehicles",
        module: "distribution",
        permission: P.fulfillment.vehicles.view,
        group: "Fleet management",
      },
      {
        href: "/fulfillment/routes",
        label: "Routes",
        module: "distribution",
        permission: P.fulfillment.routes.view,
        group: "Fleet management",
      },
      {
        href: "/fulfillment/schedules",
        label: "Route schedules",
        module: "distribution",
        permission: P.fulfillment.routes.view,
        group: "Fleet management",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: "📈",
    collapsible: true,
    items: buildReportNavItems(),
  },
  {
    id: "users",
    label: "User management",
    icon: "🔐",
    collapsible: true,
    items: [
      {
        href: "/admin/users",
        label: "Users",
        module: "admin",
        permission: P.admin.users.view,
        orgAdminOnly: true,
        requireAdmin: true,
      },
      {
        href: "/admin/roles",
        label: "Roles & permissions",
        module: "admin",
        permission: P.admin.roles.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/audit",
        label: "Activity logs",
        module: "admin",
        permission: P.admin.audit.view,
        orgAdminOnly: true,
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "⚙️",
    collapsible: true,
    items: [
      {
        href: "/admin",
        label: "Admin overview",
        module: "admin",
        permission: P.admin.overview.view,
        orgAdminOnly: true,
        exact: true,
      },
      {
        href: "/admin/company",
        label: "Company profile",
        module: "admin",
        permission: P.admin.company.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/branches",
        label: "Branches",
        module: "admin",
        permission: P.admin.branches.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/settings",
        label: "System preferences",
        module: "admin",
        permission: P.admin.settings.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/payment-methods",
        label: "Payment methods",
        module: "admin",
        permission: P.admin.payment_methods.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/kra-responses",
        label: "KRA device log",
        module: "admin",
        permission: P.admin.settings.view,
        orgAdminOnly: true,
      },
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

export function isNavItemVisible(item, { isModuleEnabled, hasPermission, requireTillFloat, user, capabilities, isSuperAdmin, organization }) {
  if (item.superAdminOnly && !isSuperAdmin?.()) return false;
  if (
    shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin }) &&
    !item.superAdminOnly
  ) {
    return false;
  }
  if (
    item.orgAdminOnly &&
    shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin })
  ) {
    return false;
  }
  if (item.requireTillFloat && !requireTillFloat) return false;
  if (item.requireMobileLoadingSheets && !shouldShowMobileLoadingSheets(capabilities)) return false;
  if (item.requireMobileFieldAttendance && !shouldShowMobileFieldAttendance(capabilities)) return false;
  if (item.requireAdmin && !user?.is_admin && !capabilities?.is_admin) return false;
  if (item.requireAnyReportsModule && !anyReportsModuleEnabled(capabilities?.modules)) return false;
  if (item.moduleAny?.length) {
    if (!item.moduleAny.some((key) => isModuleEnabled(key))) return false;
  } else if (item.module && !isModuleEnabled(item.module)) return false;
  if (item.reportKey && !canViewReport(item.reportKey, hasPermission)) return false;
  else if (item.permission && !hasPermission(item.permission)) return false;
  return true;
}
