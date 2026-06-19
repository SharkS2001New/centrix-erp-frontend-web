import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { HR_REPORT_DEFS } from "@/lib/reports/hr-reports";
import { canViewReport, P, reportPermissionCode } from "@/lib/permission-codes";
import { shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";
import { reportModuleForSlug, anyReportsModuleEnabled } from "@/lib/module-registry";
import { shouldShowMobileLoadingSheets, shouldShowMobileFieldAttendance } from "@/lib/sales-settings";

function reportNavLabel(key) {
  const title = REPORT_DEFINITIONS[key]?.title ?? key;
  return title.replace(/ Report$/i, "");
}

function buildReportNavItems() {
  const items = [
    {
      href: "/reports",
      label: "Overview",
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
      group: "Overview",
      requireAnyReportsModule: true,
    },
    {
      href: "/reports/customer-statement",
      label: "Customer statement",
      module: "accounting.reports",
      permission: P.reports.customer_statement.view,
      group: "Finance reports",
    },
    {
      href: "/reports/subledger-reconciliation",
      label: "Subledger reconciliation",
      module: "accounting.reports",
      permission: P.accounting.general_ledger.view,
      reportKey: "subledger-reconciliation",
      group: "Finance reports",
    },
  ];

  const REPORT_NAV_GROUPS = [
    {
      group: "Sales reports",
      keys: ["daily-sales", "sales-by-product", "sales-by-customer", "till-sessions"],
    },
    {
      group: "Inventory reports",
      keys: ["stock-on-hand", "stock-movement"],
    },
    {
      group: "Purchasing reports",
      keys: ["purchases-by-supplier"],
    },
    {
      group: "Finance reports",
      keys: ["profit-loss", "top-debtors", "expenses", "vat-collected", "invoice-payments", "ar-aging"],
    },
    {
      group: "Compliance reports",
      keys: ["kra-receipts"],
    },
  ];

  for (const { group, keys } of REPORT_NAV_GROUPS) {
    for (const key of keys) {
      const def = REPORT_DEFINITIONS[key];
      items.push({
        href: `/reports/${key}`,
        label:
          key === "purchases-by-supplier"
            ? "Purchases summary"
            : def?.title?.replace(/ Report$/i, "") ?? reportNavLabel(key),
        module: reportModuleForSlug(key),
        moduleAny:
          key === "profit-loss" ||
          key === "top-debtors" ||
          key === "expenses" ||
          key === "invoice-payments" ||
          key === "ar-aging" ||
          key === "kra-receipts"
            ? ["sales.reports", "accounting.reports"]
            : undefined,
        permission: reportPermissionCode(key),
        reportKey: key,
        group,
      });
    }
  }

  for (const report of HR_REPORT_DEFS) {
    items.push({
      href: `/reports/${report.key}`,
      label: report.label,
      module: "hr_payroll.reports",
      permission: reportPermissionCode(report.key),
      reportKey: report.key,
      group: "HR reports",
    });
  }

  return items;
}

/** @typedef {{ href: string, label: string, module?: string | null, moduleAny?: string[], permission?: string, exact?: boolean, ordersNav?: boolean, requireTillFloat?: boolean, requireAdmin?: boolean, superAdminOnly?: boolean, orgAdminOnly?: boolean, group?: string, reportKey?: string }} NavItem */

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
        label: "Sales analytics",
        module: "sales.dashboard",
        permission: P.sales.dashboard.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/inventory",
        label: "Inventory analytics",
        module: "inventory.dashboard",
        permission: P.inventory.stock.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/accounting",
        label: "Finance overview",
        module: "accounting.dashboard",
        permission: P.accounting.dashboard.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/hr",
        label: "HR overview",
        module: "hr_payroll.dashboard",
        permission: P.hr.employees.view,
        group: "Analytics",
        exact: true,
      },
      {
        href: "/fulfillment",
        label: "Fulfillment analytics",
        module: "distribution.dashboard",
        permission: P.fulfillment.drivers.view,
        group: "Analytics",
        exact: true,
      },
    ],
  },
  {
    id: "sales",
    label: "Sales & orders",
    icon: "🛒",
    collapsible: true,
    items: [
      {
        href: "/sales/orders",
        label: "All orders",
        module: "sales.backend",
        permission: P.sales.orders.view,
        ordersNav: true,
      },
      {
        href: "/sales/pos",
        label: "Create order",
        module: "sales.pos",
        permission: P.pos.checkout.create,
        group: "Point of sale",
      },
      {
        href: "/sales/till-management",
        label: "Till management",
        module: "sales.pos",
        permission: P.pos.till_management.view,
        requireTillFloat: true,
        group: "Point of sale",
      },
      {
        href: "/sales/end-of-day",
        label: "End of day",
        module: "sales.pos",
        permission: P.pos.end_of_day.view,
        group: "Point of sale",
      },
      {
        href: "/sales/returns",
        label: "Returns & credit notes",
        module: "sales.backend",
        permission: P.sales.returns.view,
        group: "After sales",
      },
      {
        href: "/sales/reservations",
        label: "Reservations",
        module: "sales.backend",
        permission: P.sales.reservations.view,
        group: "After sales",
      },
      {
        href: "/sales/vouchers",
        label: "Vouchers",
        module: "sales.backend",
        permission: P.sales.vouchers.view,
        group: "Promotions & loyalty",
      },
      {
        href: "/sales/loyalty-cards",
        label: "Loyalty cards",
        module: "sales.backend",
        permission: P.sales.loyalty_cards.view,
        group: "Promotions & loyalty",
      },
      {
        href: "/sales/loading-sheets",
        label: "Loading sheets",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireMobileLoadingSheets: true,
        group: "Field sales",
      },
      {
        href: "/sales/field-attendance",
        label: "Field attendance",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireMobileFieldAttendance: true,
        group: "Field sales",
      },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    icon: "👥",
    collapsible: true,
    items: [
      {
        href: "/customers",
        label: "Customer list",
        module: "customers_suppliers",
        permission: P.customers.customers.view,
      },
    ],
  },
  {
    id: "catalogue",
    label: "Product catalogue",
    icon: "📋",
    collapsible: true,
    items: [
      {
        href: "/products",
        label: "Products",
        module: null,
        permission: P.catalogue.products.view,
        group: "Products",
      },
      {
        href: "/categories",
        label: "Categories",
        module: null,
        permission: P.catalogue.categories.view,
        group: "Products",
      },
      {
        href: "/uoms",
        label: "Units of measure",
        module: null,
        permission: P.catalogue.uoms.view,
        group: "Products",
      },
      {
        href: "/retail-package-settings",
        label: "Retail packages",
        module: null,
        permission: P.catalogue.retail_packages.view,
        group: "Products",
      },
      {
        href: "/vats",
        label: "VAT / tax rates",
        module: null,
        permission: P.catalogue.vat_rates.view,
        group: "Pricing & tax",
      },
      {
        href: "/price-history",
        label: "Price history",
        module: null,
        permission: P.catalogue.price_history.view,
        group: "Pricing & tax",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "📦",
    collapsible: true,
    items: [
      {
        href: "/inventory/stock",
        label: "Stock levels",
        module: "inventory",
        permission: P.inventory.stock.view,
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
        label: "Transactions",
        module: "inventory",
        permission: P.inventory.movements.view,
        group: "Stock",
      },
      {
        href: "/inventory/transfers",
        label: "Transfers",
        module: "inventory",
        permission: P.inventory.transfers.view,
        group: "Movements",
      },
      {
        href: "/inventory/transfers/new",
        label: "New transfer",
        module: "inventory",
        permission: P.inventory.transfers.create,
        group: "Movements",
      },
      {
        href: "/inventory/receipts",
        label: "Goods received",
        module: "inventory",
        permission: P.inventory.receipts.view,
        group: "Movements",
      },
      {
        href: "/inventory/damages",
        label: "Write-offs & damages",
        module: "inventory",
        permission: P.inventory.damages.view,
        group: "Movements",
      },
    ],
  },
  {
    id: "purchases",
    label: "Purchasing",
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
        label: "Purchase orders (LPO)",
        module: "customers_suppliers",
        permission: P.purchasing.lpo.view,
        group: "Suppliers",
      },
      {
        href: "/suppliers/payments",
        label: "Supplier payments",
        module: "customers_suppliers",
        permission: P.purchasing.supplier_payments.view,
        group: "Payments & returns",
      },
      {
        href: "/suppliers/returns",
        label: "Supplier returns",
        module: "customers_suppliers",
        permission: P.purchasing.supplier_returns.view,
        group: "Payments & returns",
      },
    ],
  },
  {
    id: "accounting",
    label: "Accounting & finance",
    icon: "💰",
    collapsible: true,
    items: [
      {
        href: "/accounting/customer-invoices",
        label: "Customer invoices",
        module: "payments",
        permission: P.payments.customer_invoices.view,
        group: "Accounts receivable",
      },
      {
        href: "/accounting/accounts-receivable",
        label: "Receivables ledger",
        module: "accounting",
        permission: P.accounting.accounts_receivable.view,
        group: "Accounts receivable",
      },
      {
        href: "/accounting/accounts-payable",
        label: "Payables ledger",
        module: "accounting",
        permission: P.accounting.accounts_payable.view,
        group: "Accounts payable",
      },
      {
        href: "/accounting/chart-of-accounts",
        label: "Chart of accounts",
        module: "accounting",
        permission: P.accounting.chart_of_accounts.view,
        group: "General ledger",
      },
      {
        href: "/accounting/journal-entries",
        label: "Journal entries",
        module: "accounting",
        permission: P.accounting.journal_entries.view,
        group: "General ledger",
      },
      {
        href: "/accounting/general-ledger",
        label: "General ledger",
        module: "accounting",
        permission: P.accounting.general_ledger.view,
        group: "General ledger",
      },
      {
        href: "/expenses",
        label: "Expenses",
        module: "accounting",
        permission: P.accounting.expenses.view,
        group: "Expenses",
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
        label: "Cash flow statement",
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
        group: "People",
      },
      {
        href: "/hr/departments",
        label: "Departments",
        module: "hr_payroll",
        permission: P.hr.departments.view,
        group: "People",
      },
      {
        href: "/hr/positions",
        label: "Positions",
        module: "hr_payroll",
        permission: P.hr.positions.view,
        group: "People",
      },
      {
        href: "/hr/attendance",
        label: "Attendance",
        module: "hr_payroll",
        permission: P.hr.attendance.view,
        group: "Time & attendance",
      },
      {
        href: "/hr/leave",
        label: "Leave",
        module: "hr_payroll",
        permission: P.hr.leave.view,
        group: "Time & attendance",
      },
      {
        href: "/hr/shifts",
        label: "Shifts",
        module: "hr_payroll",
        permission: P.hr.shifts.view,
        group: "Time & attendance",
      },
      {
        href: "/hr/overtime",
        label: "Overtime",
        module: "hr_payroll",
        permission: P.hr.overtime.view,
        group: "Time & attendance",
      },
      {
        href: "/hr/payroll",
        label: "Payroll runs",
        module: "hr_payroll",
        permission: P.hr.payroll.view,
        group: "Payroll",
      },
      {
        href: "/hr/allowances",
        label: "Allowances",
        module: "hr_payroll",
        permission: P.hr.allowances.view,
        group: "Payroll",
      },
      {
        href: "/hr/deductions",
        label: "Deductions",
        module: "hr_payroll",
        permission: P.hr.deductions.view,
        group: "Payroll",
      },
      {
        href: "/hr/cash-advances",
        label: "Cash advances",
        module: "hr_payroll",
        permission: P.hr.cash_advances.view,
        group: "Payroll",
      },
      {
        href: "/hr/kpis",
        label: "KPIs",
        module: "hr_payroll",
        permission: P.hr.kpis.view,
        group: "Performance",
      },
    ],
  },
  {
    id: "logistics",
    label: "Fulfillment & logistics",
    icon: "🚛",
    collapsible: true,
    items: [
      {
        href: "/fulfillment/dispatch",
        label: "Dispatch",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
        group: "Fulfillment",
      },
      {
        href: "/fulfillment/trips",
        label: "Trips",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
        group: "Fulfillment",
      },
      {
        href: "/fulfillment/pod-records",
        label: "Proof of delivery",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
        group: "Fulfillment",
      },
      {
        href: "/fulfillment/drivers",
        label: "Drivers",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
        group: "Fleet",
      },
      {
        href: "/fulfillment/vehicles",
        label: "Vehicles",
        module: "distribution",
        permission: P.fulfillment.vehicles.view,
        group: "Fleet",
      },
      {
        href: "/fulfillment/routes",
        label: "Routes",
        module: "distribution",
        permission: P.fulfillment.routes.view,
        group: "Fleet",
      },
      {
        href: "/fulfillment/schedules",
        label: "Schedules",
        module: "distribution",
        permission: P.fulfillment.routes.view,
        group: "Fleet",
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
        label: "Audit log",
        module: "admin",
        permission: P.admin.audit.view,
        orgAdminOnly: true,
      },
    ],
  },
  {
    id: "settings",
    label: "Administration",
    icon: "⚙️",
    collapsible: true,
    items: [
      {
        href: "/admin",
        label: "Overview",
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
        group: "Organisation",
      },
      {
        href: "/admin/branches",
        label: "Branches",
        module: "admin",
        permission: P.admin.branches.view,
        orgAdminOnly: true,
        group: "Organisation",
      },
      {
        href: "/admin/payment-methods",
        label: "Payment methods",
        module: "admin",
        permission: P.admin.payment_methods.view,
        orgAdminOnly: true,
        group: "Finance & tax",
      },
      {
        href: "/vats",
        label: "VAT / tax rates",
        module: null,
        permission: P.catalogue.vat_rates.view,
        orgAdminOnly: true,
        group: "Finance & tax",
      },
      {
        href: "/admin/kra-responses",
        label: "KRA responses",
        module: "admin",
        permission: P.admin.settings.view,
        orgAdminOnly: true,
        group: "Finance & tax",
      },
      {
        href: "/admin/settings",
        label: "System preferences",
        module: "admin",
        permission: P.admin.settings.view,
        orgAdminOnly: true,
        group: "Settings",
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
