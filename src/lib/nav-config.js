import { buildCatalogReportNavItems } from "@/lib/reports/report-nav";
import { canViewReport, ORDER_QUEUE_VIEW_PERMISSIONS, P } from "@/lib/permission-codes";
import { hasOperationalModule, shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";
import { anyReportsModuleEnabled, isModuleEnabledForNav } from "@/lib/module-registry";
import { shouldShowMobileLoadingSheets, shouldShowMobileFieldAttendance, shouldShowMobilePickingLists, isOrgMobileSalesEnabled, isVouchersEnabled, isRedeemablePointsEnabled, shouldShowLoadingListNav } from "@/lib/sales-settings";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { userHasMobileChannel } from "@/lib/mobile-order-scope";
import { isKraDeviceConfigured, isMpesaC2bReconciliationEnabled } from "@/lib/finance-settings";
import { isCashAdvanceDeductionsEnabled } from "@/lib/hr-settings";
import { isLegacyArchiveEnabled } from "@/lib/legacy-archive-settings";
import { isReportNavEnabled } from "@/lib/nav-feature-gates";
import { isPlatformWhatsappEnabled } from "@/lib/platform-org-features";
import { withNavItemIcons } from "@/lib/nav-item-icons";
import { platformNavItems } from "@/lib/platform-nav";

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

/** @typedef {{ href: string, label: string, icon?: string, module?: string | null, moduleAny?: string[], permission?: string, permissionAny?: string[], exact?: boolean, ordersNav?: boolean, mobileOrdersNav?: boolean, requireTillFloat?: boolean, requireAdmin?: boolean, requireOperationalModule?: boolean, superAdminOnly?: boolean, orgAdminOnly?: boolean, requireNativeAccounting?: boolean, requireExternalAccounting?: boolean, requireHrCashAdvances?: boolean, requireSalesVouchers?: boolean, requireRedeemablePoints?: boolean, requireKraDevice?: boolean, group?: string, reportKey?: string, requireLoadingListNav?: boolean, requireMobilePickingListNav?: boolean }} NavItem */

/** @typedef {{ id: string, label?: string, icon?: string, module?: string | null, collapsible?: boolean, superAdminOnly?: boolean, variant?: "link", requireUserMobileChannel?: boolean, requireOrgMobileSales?: boolean, items: NavItem[] }} NavSection */

/** @type {NavSection[]} */
const NAV_SECTION_DEFINITIONS = [
  {
    id: "platform",
    label: "Platform",
    icon: "🌐",
    superAdminOnly: true,
    collapsible: true,
    items: platformNavItems(),
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
        permission: P.dashboard.sales.view,
        exact: true,
      },
      {
        href: "/inventory",
        label: "Inventory analytics",
        module: "inventory.dashboard",
        permission: P.dashboard.inventory.view,
        exact: true,
      },
      {
        href: "/fulfillment",
        label: "Distribution overview",
        module: "distribution.dashboard",
        permission: P.fulfillment.overview.view,
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
        permission: P.sales.order_queues.all.view,
        ordersNav: true,
      },
      {
        href: "/sales/orders/queues/whatsapp",
        label: "WhatsApp",
        module: "sales.backend",
        permission: P.sales.orders.view,
        requireWhatsappOrders: true,
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
        permission: P.sales.order_queues.mobile.view,
        mobileOrdersNav: true,
        requireUserMobileChannel: true,
      },
      {
        href: "/sales/loading-sheets",
        label: "Loading lists",
        module: "sales.backend",
        permission: P.sales.loading_sheets.view,
        requireLoadingListNav: true,
      },
      {
        href: "/sales/picking-lists",
        label: "Picking list",
        module: "sales.backend",
        permissionAny: [
          P.sales.loading_sheets.view,
          P.fulfillment.picking.view,
          P.sales.order_queues.mobile.view,
        ],
        requireMobilePickingListNav: true,
      },
      {
        href: "/sales/field-attendance",
        label: "Field attendance",
        module: "sales.backend",
        permission: P.sales.field_attendance.view,
      },
      {
        href: "/fulfillment/routes",
        label: "Routes",
        moduleAny: ["sales.mobile", "sales.backend"],
        permissionAny: [
          P.fulfillment.routes.view,
          P.mobile_sales.routes.view,
          P.sales.order_queues.mobile.view,
        ],
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
        permission: P.reports.legacy_archive.view,
        reportKey: "legacy-archive",
        requireLegacyArchive: true,
      },
      {
        href: "/sales/legacy-orders",
        label: "Legacy orders",
        module: "sales.backend",
        permission: P.sales.legacy_orders.view,
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
        label: "Inventory movements",
        module: "inventory",
        permission: P.inventory.movements.view,
      },
      {
        href: "/inventory/stock",
        label: "Items currently in stock",
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
        moduleAny: ["payments", "accounting"],
        permissionAny: [P.payments.customer_invoices.view, P.accounting.accounts_receivable.view],
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
        href: "/accounting/bank-register",
        label: "Bank register",
        module: "accounting",
        permissionAny: [
          P.accounting.bank_reconciliation.view,
          P.accounting.general_ledger.view,
        ],
        group: "General ledger",
      },
      {
        href: "/accounting/bank-reconciliation",
        label: "Bank reconciliation",
        module: "accounting",
        permissionAny: [
          P.accounting.bank_reconciliation.view,
          P.accounting.general_ledger.view,
          P.accounting.journal_entries.view,
        ],
        group: "General ledger",
      },
      {
        href: "/accounting/mpesa-reconciliation",
        label: "M-Pesa reconciliation",
        module: "accounting",
        requireMpesaC2bReconciliation: true,
        permissionAny: [
          P.accounting.bank_reconciliation.view,
          P.payments.sale_payments.view,
        ],
        group: "General ledger",
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
    id: "distribution_fleet",
    label: "Fleet & routes",
    icon: "🚛",
    collapsible: true,
    items: [
      {
        href: "/fulfillment/routes",
        label: "Routes",
        module: "distribution",
        permission: P.fulfillment.routes.view,
      },
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
        href: "/fulfillment/schedules",
        label: "Schedules",
        module: "distribution",
        permission: P.fulfillment.schedules.view,
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
        permissionAny: ORDER_QUEUE_VIEW_PERMISSIONS,
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
        label: "Dispatch board",
        module: "distribution",
        permission: P.fulfillment.dispatch.view,
      },
      {
        href: "/fulfillment/trips",
        label: "Trips",
        module: "distribution",
        permission: P.fulfillment.trips.view,
      },
      {
        href: "/fulfillment/picking",
        label: "Warehouse picking",
        module: "distribution",
        permission: P.fulfillment.picking.view,
      },
      {
        href: "/fulfillment/loading-lists",
        label: "Loading lists",
        module: "distribution",
        permission: P.fulfillment.loading_lists.view,
      },
      {
        href: "/fulfillment/pod-records",
        label: "Proof of delivery",
        module: "distribution",
        permission: P.fulfillment.pod.view,
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
    id: "hospitality_dashboard",
    label: "Dashboard",
    icon: "🏨",
    collapsible: true,
    items: [
      {
        href: "/hospitality",
        label: "Hospitality overview",
        module: "hospitality.dashboard",
        permission: P.hospitality.dashboard.view,
        exact: true,
      },
    ],
  },
  {
    id: "hospitality_rooms",
    label: "Rooms & guests",
    icon: "🛏️",
    collapsible: true,
    items: [
      {
        href: "/hospitality/rooms",
        label: "Rooms",
        module: "hospitality.backend",
        permission: P.hospitality.rooms.view,
      },
      {
        href: "/hospitality/reservations",
        label: "Reservations",
        module: "hospitality.backend",
        permission: P.hospitality.reservations.view,
      },
      {
        href: "/hospitality/front-desk",
        label: "Front desk",
        module: "hospitality.backend",
        permission: P.hospitality.frontdesk.view,
      },
      {
        href: "/hospitality/folios",
        label: "Guest folios",
        module: "hospitality.backend",
        permission: P.hospitality.folios.view,
      },
    ],
  },
  {
    id: "hospitality_ops",
    label: "Operations",
    icon: "🧹",
    collapsible: true,
    items: [
      {
        href: "/hospitality/housekeeping",
        label: "Housekeeping",
        module: "hospitality.backend",
        permission: P.hospitality.housekeeping.view,
      },
      {
        href: "/hospitality/outlets",
        label: "Outlets & floor",
        module: "hospitality.backend",
        permission: P.hospitality.outlets.view,
      },
      {
        href: "/hospitality/night-audit",
        label: "Night audit",
        module: "hospitality.backend",
        permission: P.hospitality.night_audit.view,
      },
      {
        href: "/hospitality/settings",
        label: "Hospitality settings",
        module: "hospitality.backend",
        permission: P.hospitality.settings.view,
      },
    ],
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
        href: "/admin/license",
        label: "License Information",
        module: "admin",
        permission: P.admin.license.view,
        orgAdminOnly: true,
      },
      {
        href: "/admin/settings",
        label: "Organization settings",
        requireOperationalModule: true,
        permissionAny: [P.admin.settings.view, P.admin.settings.edit, "admin.manage"],
        orgAdminOnly: true,
      },
      {
        href: "/admin/till-printing",
        label: "Local printing",
        module: "admin",
        permission: P.admin.till_printing.view,
        orgAdminOnly: true,
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
        permission: P.admin.kra_responses.view,
        orgAdminOnly: true,
        requireKraDevice: true,
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    icon: "👤",
    collapsible: true,
    sharedAcrossWorkspaces: true,
    items: [
      {
        href: "/notifications",
        label: "Notifications",
        module: null,
        permission: P.admin.notifications.view,
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

export function isNavItemVisible(item, { isModuleEnabled, hasPermission, hasNavPermission, requireTillFloat, user, capabilities, isSuperAdmin, organization }) {
  const checkPermission = hasNavPermission ?? hasPermission;
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
  if (item.requireLoadingListNav && !shouldShowLoadingListNav(capabilities)) return false;
  if (item.requireMobilePickingListNav && !shouldShowMobilePickingLists(capabilities)) return false;
  if (item.requireMultiBranchCatalog && !isMultiBranchCatalog(capabilities)) return false;
  if (item.requireMobileFieldAttendance && !shouldShowMobileFieldAttendance(capabilities)) return false;
  if (item.requireUserMobileChannel && !userHasMobileChannel(user?.login_channels)) return false;
  if (item.requireOrgMobileSales && !isOrgMobileSalesEnabled(capabilities)) return false;
  if (item.requireLegacyArchive && !isLegacyArchiveEnabled(capabilities)) return false;
  if (item.requireAdmin && !user?.is_admin && !capabilities?.is_admin) return false;
  if (item.requireHrCashAdvances && !isCashAdvanceDeductionsEnabled(capabilities?.module_settings)) return false;
  if (item.requireSalesVouchers && !isVouchersEnabled(capabilities?.module_settings)) return false;
  if (item.requireRedeemablePoints && !isRedeemablePointsEnabled(capabilities?.module_settings)) return false;
  if (item.requireKraDevice && !isKraDeviceConfigured(capabilities?.module_settings, capabilities)) return false;
  if (item.requireMpesaC2bReconciliation && !isMpesaC2bReconciliationEnabled(capabilities?.module_settings)) return false;
  if (item.requireWhatsappOrders && !isPlatformWhatsappEnabled(capabilities)) return false;
  if (item.reportKey && !isReportNavEnabled(item.reportKey, capabilities)) return false;
  if (item.requireAnyReportsModule && !anyReportsModuleEnabled(capabilities?.modules)) return false;
  if (item.requireOperationalModule && !hasOperationalModule(capabilities)) return false;
  if (item.moduleAny?.length) {
    if (!item.moduleAny.some((key) => isModuleEnabledForNav(key, isModuleEnabled))) return false;
  } else if (item.module && !isModuleEnabledForNav(item.module, isModuleEnabled)) return false;
  if (item.reportKey && !canViewReport(item.reportKey, checkPermission)) return false;
  if (item.permissionAny?.length) {
    if (!item.permissionAny.some((code) => checkPermission(code))) return false;
  } else if (item.permission && !checkPermission(item.permission)) return false;
  return true;
}
