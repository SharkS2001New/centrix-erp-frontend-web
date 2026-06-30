import { buildCatalogReportNavItems } from "@/lib/reports/report-nav";
import { canViewReport, P } from "@/lib/permission-codes";
import { hasOperationalModule, shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";
import { anyReportsModuleEnabled, isModuleEnabledForNav } from "@/lib/module-registry";
import { shouldShowMobileLoadingSheets, shouldShowMobileFieldAttendance, isOrgMobileSalesEnabled, isVouchersEnabled, isRedeemablePointsEnabled } from "@/lib/sales-settings";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { userHasMobileChannel } from "@/lib/mobile-order-scope";
import { usesExternalAccounting, usesNativeAccounting } from "@/lib/finance-settings";
import { isCashAdvanceDeductionsEnabled } from "@/lib/hr-settings";
import { isLegacyArchiveEnabled } from "@/lib/legacy-archive-settings";
import { withNavItemIcons } from "@/lib/nav-item-icons";

function buildReportNavItems() {
  return [
    {
      href: "/reports",
      label: "Report overview",
      icon: "reports",
      module: null,
      permission: P.reports.hub.view,
      exact: true,
      requireAnyReportsModule: true,
    },
    {
      href: "/reports/builder",
      label: "Report builder",
      icon: "plus",
      module: null,
      permission: P.reports.builder.view,
      requireAnyReportsModule: true,
    },
    ...buildCatalogReportNavItems(),
  ];
}

/** @typedef {{ href: string, label: string, icon?: string, module?: string | null, moduleAny?: string[], permission?: string, permissionAny?: string[], exact?: boolean, ordersNav?: boolean, mobileOrdersNav?: boolean, requireTillFloat?: boolean, requireAdmin?: boolean, requireOperationalModule?: boolean, superAdminOnly?: boolean, orgAdminOnly?: boolean, requireNativeAccounting?: boolean, requireExternalAccounting?: boolean, requireHrCashAdvances?: boolean, requireSalesVouchers?: boolean, requireRedeemablePoints?: boolean, group?: string, reportKey?: string }} NavItem */

/** @typedef {{ id: string, label?: string, icon?: string, module?: string | null, collapsible?: boolean, superAdminOnly?: boolean, variant?: "link", requireUserMobileChannel?: boolean, requireOrgMobileSales?: boolean, items: NavItem[] }} NavSection */

/** @type {NavSection[]} */
const NAV_SECTION_DEFINITIONS = [
  {
    id: "platform",
    label: "Platform",
    icon: "🌐",
    superAdminOnly: true,
    collapsible: true,
    items: [
      { href: "/platform", label: "Overview", exact: true, superAdminOnly: true },
      { href: "/platform/ai-training", label: "AI training", superAdminOnly: true },
      { href: "/platform/active-users", label: "Active users", superAdminOnly: true },
      { href: "/platform/system-issues", label: "System errors & reports", superAdminOnly: true },
      { href: "/platform/database-backups", label: "Database backups", superAdminOnly: true },
      { href: "/platform/legacy-import-converter", label: "Legacy data converter", superAdminOnly: true },
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
        label: "Business summary",
        module: null,
        permission: P.dashboard.overview.view,
        exact: true,
      },
      {
        href: "/sales",
        label: "Sales analytics",
        module: "sales.dashboard",
        permission: P.sales.dashboard.view,
        exact: true,
      },
      {
        href: "/inventory",
        label: "Inventory analytics",
        module: "inventory.dashboard",
        permission: P.inventory.stock.view,
        exact: true,
      },
      {
        href: "/fulfillment",
        label: "Distribution overview",
        module: "distribution.dashboard",
        permission: P.fulfillment.drivers.view,
        group: "Analytics",
        exact: true,
      },
    ],
  },
  {
    id: "products",
    label: "Products",
    icon: "📋",
    collapsible: true,
    items: [
      {
        href: "/products",
        label: "Products catalogue",
        module: null,
        permission: P.catalogue.products.view,
      },
      {
        href: "/categories",
        label: "Categories",
        module: null,
        permission: P.catalogue.categories.view,
      },
      {
        href: "/uoms",
        label: "Units of measure",
        module: null,
        permission: P.catalogue.uoms.view,
      },
      {
        href: "/retail-package-settings",
        label: "Retail packages",
        module: null,
        permission: P.catalogue.retail_packages.view,
      },
    ],
  },
  {
    id: "pos",
    label: "Till operations",
    icon: "💳",
    collapsible: true,
    items: [
      {
        href: "/sales/end-of-day",
        label: "End of day report",
        module: "sales.pos",
        permission: P.pos.end_of_day.view,
      },
      {
        href: "/sales/till-management",
        label: "Till management",
        module: "sales.pos",
        permission: P.pos.till_management.view,
        requireTillFloat: true,
      },
    ],
  },
  {
    id: "pricing_tax",
    label: "Pricing & tax",
    icon: "💰",
    collapsible: true,
    items: [
      {
        href: "/vats",
        label: "VAT / tax rates",
        module: null,
        permission: P.catalogue.vat_rates.view,
      },
      {
        href: "/price-history",
        label: "Price history",
        module: null,
        permission: P.catalogue.price_history.view,
      },
    ],
  },
  {
    id: "sales_orders",
    label: "Sales & orders",
    icon: "🛒",
    collapsible: true,
    items: [
      {
        href: "/sales/pos",
        label: "Create new order",
        module: "sales.backend",
        permissionAny: [P.pos.checkout.create, P.sales.orders.create],
      },
      {
        href: "/sales/orders",
        label: "All orders",
        module: "sales.backend",
        permission: P.sales.orders.view,
        ordersNav: true,
      },
    ],
  },
  {
    id: "field_sales",
    label: "Field sales",
    icon: "📱",
    collapsible: true,
    requireOrgMobileSales: true,
    items: [
      {
        href: "/sales/orders/queues/mobile",
        label: "Mobile orders",
        module: "sales.backend",
        permission: P.sales.orders.view,
        mobileOrdersNav: true,
        requireUserMobileChannel: true,
      },
      {
        href: "/sales/loading-sheets",
        label: "Loading list",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireMobileLoadingSheets: true,
      },
      {
        href: "/sales/field-attendance",
        label: "Field attendance",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireMobileFieldAttendance: true,
      },
    ],
  },
  {
    id: "legacy_system",
    label: "Legacy orders (Old system)",
    icon: "🗃️",
    collapsible: true,
    requireLegacyArchive: true,
    items: [
      {
        href: "/reports/legacy-archive",
        label: "Legacy sales archive",
        module: "sales.reports",
        permission: P.reports.hub.view,
        reportKey: "legacy-archive",
        requireLegacyArchive: true,
      },
      {
        href: "/sales/legacy-orders",
        label: "Legacy orders",
        module: "sales.backend",
        permission: P.sales.returns.view,
        requireLegacyArchive: true,
      },
      {
        href: "/sales/legacy-returns",
        label: "Legacy returns",
        module: "sales.backend",
        permission: P.sales.returns.view,
        requireLegacyArchive: true,
      },
    ],
  },
  {
    id: "after_sales",
    label: "After sales",
    icon: "↩️",
    collapsible: true,
    items: [
      {
        href: "/sales/returns",
        label: "Returns & credit notes",
        module: "sales.backend",
        permission: P.sales.returns.view,
      },
      {
        href: "/sales/reservations",
        label: "Reservations",
        module: "sales.backend",
        permission: P.sales.reservations.view,
      },
    ],
  },
  {
    id: "promotions",
    label: "Promotions & loyalty",
    icon: "🎁",
    collapsible: true,
    items: [
      {
        href: "/sales/vouchers",
        label: "Vouchers",
        module: "sales.backend",
        permission: P.sales.vouchers.view,
        requireSalesVouchers: true,
      },
      {
        href: "/sales/loyalty-cards",
        label: "Loyalty cards",
        module: "sales.backend",
        permission: P.sales.loyalty_cards.view,
        requireRedeemablePoints: true,
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
        label: "Customers",
        module: "customers_suppliers",
        permission: P.customers.customers.view,
      },
    ],
  },
  {
    id: "expenses",
    label: "Expenses",
    icon: "🏷️",
    collapsible: true,
    items: [
      {
        href: "/expenses",
        label: "Expenses",
        moduleAny: ["accounting", "customers_suppliers"],
        permission: P.accounting.expenses.view,
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
        href: "/inventory/stock-take",
        label: "Stock take",
        module: "inventory",
        permission: P.inventory.stock_take.view,
      },
      {
        href: "/inventory/transactions",
        label: "Transactions",
        module: "inventory",
        permission: P.inventory.movements.view,
      },
      {
        href: "/inventory/stock",
        label: "Stock levels",
        module: "inventory",
        permission: P.inventory.stock.view,
      },
    ],
  },
  {
    id: "stock_movements",
    label: "Stock movements",
    icon: "🔄",
    collapsible: true,
    items: [
      {
        href: "/inventory/transfers",
        label: "Transfers",
        module: "inventory",
        permission: P.inventory.transfers.view,
      },
      {
        href: "/inventory/transfers/new",
        label: "New transfer",
        module: "inventory",
        permission: P.inventory.transfers.create,
      },
      {
        href: "/inventory/branch-transfers/new",
        label: "Inter-branch transfer",
        module: "inventory",
        permission: P.inventory.transfers.create,
        requireMultiBranchCatalog: true,
      },
      {
        href: "/inventory/receipts",
        label: "Goods received",
        module: "inventory",
        permission: P.inventory.receipts.view,
      },
      {
        href: "/inventory/adjustments",
        label: "Stock adjustments",
        module: "inventory",
        permission: P.inventory.adjustments.view,
      },
      {
        href: "/inventory/damages",
        label: "Write-offs & damages",
        module: "inventory",
        permission: P.inventory.damages.view,
      },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    icon: "🚚",
    collapsible: true,
    items: [
      {
        href: "/suppliers",
        label: "Suppliers list",
        module: "customers_suppliers",
        permission: P.purchasing.suppliers.view,
        exact: true,
      },
      {
        href: "/lpo",
        label: "Purchase orders (LPO)",
        module: "customers_suppliers",
        permission: P.purchasing.lpo.view,
      },
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
      {
        href: "/reports/supplier-statement",
        label: "Supplier Statement",
        module: "customers_suppliers",
        permission: P.purchasing.suppliers.view,
        reportKey: "supplier-statement",
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
        href: "/accounting",
        label: "Finance overview",
        module: "accounting",
        permission: P.accounting.dashboard.view,
        exact: true,
      },
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
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/journal-entries",
        label: "Journal entries",
        module: "accounting",
        permission: P.accounting.journal_entries.view,
        group: "General ledger",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/general-ledger",
        label: "General ledger",
        module: "accounting",
        permission: P.accounting.general_ledger.view,
        group: "General ledger",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/bank-reconciliation",
        label: "Bank reconciliation",
        module: "accounting",
        permission: P.accounting.bank_reconciliation.view,
        group: "General ledger",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/trial-balance",
        label: "Trial balance",
        module: "accounting",
        permission: P.accounting.trial_balance.view,
        group: "Financial statements",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/balance-sheet",
        label: "Balance sheet",
        module: "accounting",
        permission: P.accounting.balance_sheet.view,
        group: "Financial statements",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/profit-loss",
        label: "Profit & loss",
        module: "accounting",
        permission: P.accounting.profit_loss.view,
        group: "Financial statements",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/cash-flow",
        label: "Cash flow statement",
        module: "accounting",
        permission: P.accounting.cash_flow.view,
        group: "Financial statements",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/fiscal-periods",
        label: "Fiscal periods",
        module: "accounting",
        permission: P.accounting.fiscal_periods.view,
        group: "Setup",
        requireNativeAccounting: true,
      },
      {
        href: "/accounting/account-mappings",
        label: "Account mappings",
        module: "accounting",
        permission: P.accounting.account_mappings.view,
        group: "Setup",
        requireExternalAccounting: true,
      },
      {
        href: "/accounting/export-queue",
        label: "Export queue",
        module: "accounting",
        permission: P.accounting.export_queue.view,
        group: "Setup",
        requireExternalAccounting: true,
      },
      {
        href: "/accounting/settings",
        label: "Accounting settings",
        module: "accounting",
        permission: P.accounting.settings.view,
        group: "Setup",
        requireNativeAccounting: true,
      },
    ],
  },
  {
    id: "hr_people",
    label: "People",
    icon: "👥",
    collapsible: true,
    items: [
      {
        href: "/hr",
        label: "HR Overview",
        module: "hr_payroll",
        permission: P.hr.employees.view,
        exact: true,
      },
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
        label: "Positions",
        module: "hr_payroll",
        permission: P.hr.positions.view,
      },
    ],
  },
  {
    id: "hr_time_attendance",
    label: "Time & attendance",
    icon: "🕐",
    collapsible: true,
    items: [
      {
        href: "/hr/attendance",
        label: "Attendance",
        module: "hr_payroll",
        permission: P.hr.attendance.view,
      },
      {
        href: "/hr/leave",
        label: "Leave",
        module: "hr_payroll",
        permission: P.hr.leave.view,
      },
      {
        href: "/hr/shifts",
        label: "Shifts",
        module: "hr_payroll",
        permission: P.hr.shifts.view,
      },
      {
        href: "/hr/overtime",
        label: "Overtime",
        module: "hr_payroll",
        permission: P.hr.overtime.view,
      },
    ],
  },
  {
    id: "hr_payroll",
    label: "Payroll",
    icon: "💰",
    collapsible: true,
    items: [
      {
        href: "/hr/payroll",
        label: "Payroll runs",
        module: "hr_payroll",
        permission: P.hr.payroll.view,
      },
      {
        href: "/hr/allowances",
        label: "Allowances",
        module: "hr_payroll",
        permission: P.hr.allowances.view,
      },
      {
        href: "/hr/deductions",
        label: "Deductions",
        module: "hr_payroll",
        permission: P.hr.deductions.view,
      },
      {
        href: "/hr/cash-advances",
        label: "Cash advances",
        module: "hr_payroll",
        permission: P.hr.cash_advances.view,
        requireHrCashAdvances: true,
      },
    ],
  },
  {
    id: "hr_performance",
    label: "Performance",
    icon: "📈",
    collapsible: true,
    items: [
      {
        href: "/hr/kpis",
        label: "KPIs",
        module: "hr_payroll",
        permission: P.hr.kpis.view,
      },
    ],
  },
  {
    id: "distribution_ops",
    label: "Operations",
    icon: "🚚",
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
        label: "Trips",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
      },
      {
        href: "/fulfillment/pod-records",
        label: "Proof of delivery",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
      },
    ],
  },
  {
    id: "distribution_fleet",
    label: "Fleet & routes",
    icon: "🚛",
    collapsible: true,
    items: [
      {
        href: "/fulfillment/drivers",
        label: "Drivers",
        module: "distribution",
        permission: P.fulfillment.drivers.view,
      },
      {
        href: "/fulfillment/vehicles",
        label: "Vehicles",
        module: "distribution",
        permission: P.fulfillment.vehicles.view,
      },
      {
        href: "/fulfillment/routes",
        label: "Routes",
        module: "distribution",
        permission: P.fulfillment.routes.view,
      },
      {
        href: "/fulfillment/schedules",
        label: "Schedules",
        module: "distribution",
        permission: P.fulfillment.routes.view,
      },
    ],
  },
  {
    id: "distribution_orders",
    label: "Orders",
    icon: "📦",
    collapsible: true,
    items: [
      {
        href: "/fulfillment/orders",
        label: "Route orders",
        module: "distribution",
        permission: P.sales.orders.view,
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
    id: "admin_dashboard",
    label: "Dashboard",
    icon: "📊",
    collapsible: true,
    items: [
      {
        href: "/admin",
        label: "Admin home",
        module: "admin",
        permission: P.admin.overview.view,
        orgAdminOnly: true,
        exact: true,
      },
    ],
  },
  {
    id: "admin_organization",
    label: "Organization",
    icon: "🏢",
    collapsible: true,
    items: [
      {
        href: "/admin/company",
        label: "Company profile",
        module: "admin",
        permission: P.admin.company.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/settings",
        label: "Organization settings",
        requireOperationalModule: true,
        permission: "admin.manage",
        orgAdminOnly: true,
        requireAdmin: true,
      },
      {
        href: "/admin/till-printing",
        label: "Till printing",
        module: "admin",
        moduleAny: ["sales.pos"],
        permission: "admin.manage",
        requireAdmin: true,
      },
      {
        href: "/admin/branches",
        label: "Branches",
        module: "admin",
        permission: P.admin.branches.view,
        orgAdminOnly: true,
      },
    ],
  },
  {
    id: "admin_users",
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
        label: "Roles and permissions",
        module: "admin",
        permission: P.admin.roles.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/audit",
        label: "Audit logs",
        module: "admin",
        permission: P.admin.audit.view,
        orgAdminOnly: true,
      },
    ],
  },
  {
    id: "admin_finance_tax",
    label: "Finance & tax",
    icon: "💳",
    collapsible: true,
    items: [
      {
        href: "/admin/payment-methods",
        label: "Payment methods",
        module: "admin",
        permission: P.admin.payment_methods.view,
        orgAdminOnly: true,
      },
      {
        href: "/vats",
        label: "VAT / tax rates",
        module: null,
        permission: P.catalogue.vat_rates.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/kra-responses",
        label: "KRA responses",
        module: "admin",
        permission: P.admin.audit.view,
        orgAdminOnly: true,
      },
    ],
  },
];

export const navSections = withNavItemIcons(NAV_SECTION_DEFINITIONS);

export function isNavItemActive(item, pathname) {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isNavSectionActive(section, pathname) {
  return section.items.some((item) => isNavItemActive(item, pathname));
}

export function isNavSectionVisible(section, navContext) {
  if (section.requireUserMobileChannel && !userHasMobileChannel(navContext.user?.login_channels)) {
    return false;
  }
  if (section.requireOrgMobileSales && !isOrgMobileSalesEnabled(navContext.capabilities)) {
    return false;
  }
  if (section.requireLegacyArchive && !isLegacyArchiveEnabled(navContext.capabilities)) {
    return false;
  }
  return true;
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
  if (item.requireMultiBranchCatalog && !isMultiBranchCatalog(capabilities)) return false;
  if (item.requireMobileFieldAttendance && !shouldShowMobileFieldAttendance(capabilities)) return false;
  if (item.requireUserMobileChannel && !userHasMobileChannel(user?.login_channels)) return false;
  if (item.requireOrgMobileSales && !isOrgMobileSalesEnabled(capabilities)) return false;
  if (item.requireLegacyArchive && !isLegacyArchiveEnabled(capabilities)) return false;
  if (item.requireAdmin && !user?.is_admin && !capabilities?.is_admin) return false;
  if (item.requireNativeAccounting && !usesNativeAccounting(capabilities?.module_settings)) return false;
  if (item.requireExternalAccounting && !usesExternalAccounting(capabilities?.module_settings)) return false;
  if (item.requireHrCashAdvances && !isCashAdvanceDeductionsEnabled(capabilities?.module_settings)) return false;
  if (item.requireSalesVouchers && !isVouchersEnabled(capabilities?.module_settings)) return false;
  if (item.requireRedeemablePoints && !isRedeemablePointsEnabled(capabilities?.module_settings)) return false;
  if (item.requireAnyReportsModule && !anyReportsModuleEnabled(capabilities?.modules)) return false;
  if (item.requireOperationalModule && !hasOperationalModule(capabilities)) return false;
  if (item.moduleAny?.length) {
    if (!item.moduleAny.some((key) => isModuleEnabledForNav(key, isModuleEnabled))) return false;
  } else if (item.module && !isModuleEnabledForNav(item.module, isModuleEnabled)) return false;
  if (item.reportKey && !canViewReport(item.reportKey, hasPermission)) return false;
  if (item.permissionAny?.length) {
    if (!item.permissionAny.some((code) => hasPermission(code))) return false;
  } else if (item.permission && !hasPermission(item.permission)) return false;
  return true;
}
