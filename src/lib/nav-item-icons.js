/** @typedef {string} NavIconKey */

/** Exact href → icon (most specific wins). */
/** @type {Record<string, NavIconKey>} */
export const NAV_HREF_ICONS = {
  // Platform
  "/platform": "platform",
  "/platform/active-users": "users",
  "/platform/organizations/new": "plus",

  // Dashboards
  "/dashboard": "dashboard",
  "/sales": "chart",
  "/inventory": "inventory",
  "/accounting": "accounting",
  "/hr": "dashboard",
  "/fulfillment": "logistics",

  // Products
  "/products": "box",
  "/categories": "folder",
  "/uoms": "measure",
  "/retail-package-settings": "package",

  // POS
  "/sales/pos": "sales",
  "/sales/end-of-day": "clock",
  "/sales/till-management": "wallet",

  // Pricing & tax
  "/vats": "percent",
  "/price-history": "trend",

  // Sales & orders
  "/sales/orders": "list",

  // Field sales
  "/sales/orders/queues/mobile": "mobile",
  "/sales/loading-sheets": "clipboard",
  "/sales/field-attendance": "map",

  // After sales
  "/sales/returns": "return",
  "/sales/reservations": "calendar",

  // Promotions
  "/sales/vouchers": "tag",
  "/sales/loyalty-cards": "star",

  // Customers
  "/customers": "hr",
  "/reports/customer-statement": "users",

  // Inventory
  "/inventory/stock-take": "check",
  "/inventory/transactions": "list",
  "/inventory/stock": "inventory",

  // Stock movements
  "/inventory/transfers": "swap",
  "/inventory/transfers/new": "plus",
  "/inventory/receipts": "package",
  "/inventory/damages": "alert",

  // Suppliers
  "/suppliers": "purchases",
  "/lpo": "file",
  "/suppliers/payments": "wallet",
  "/suppliers/returns": "return",
  "/reports/supplier-statement": "receipt",

  // Accounting
  "/accounting/customer-invoices": "receipt",
  "/accounting/accounts-receivable": "trend",
  "/accounting/accounts-payable": "wallet",
  "/accounting/chart-of-accounts": "layers",
  "/accounting/journal-entries": "book",
  "/accounting/general-ledger": "accounting",
  "/expenses": "tag",
  "/accounting/trial-balance": "measure",
  "/accounting/balance-sheet": "box",
  "/accounting/profit-loss": "chart",
  "/accounting/cash-flow": "swap",
  "/accounting/fiscal-periods": "calendar",
  "/accounting/account-mappings": "link",
  "/accounting/export-queue": "package",
  "/accounting/settings": "settings",

  // HR
  "/hr/employees": "users",
  "/hr/departments": "folder",
  "/hr/positions": "list",
  "/hr/attendance": "clock",
  "/hr/leave": "calendar",
  "/hr/shifts": "clipboard",
  "/hr/overtime": "trend",
  "/hr/payroll": "receipt",
  "/hr/allowances": "plus",
  "/hr/deductions": "percent",
  "/hr/cash-advances": "wallet",
  "/hr/kpis": "star",

  // Fulfillment
  "/fulfillment/dispatch": "truck",
  "/fulfillment/trips": "logistics",
  "/fulfillment/pod-records": "check",
  "/fulfillment/drivers": "users",
  "/fulfillment/vehicles": "inventory",
  "/fulfillment/routes": "map",
  "/fulfillment/schedules": "calendar",

  // Reports hub
  "/reports": "reports",
  "/reports/builder": "plus",
  "/reports/subledger-reconciliation": "link",
  "/reports/daily-sales": "chart",
  "/reports/sales-by-product": "box",
  "/reports/sales-by-customer": "hr",
  "/reports/till-sessions": "wallet",
  "/reports/stock-on-hand": "inventory",
  "/reports/stock-movement": "swap",
  "/reports/purchases-by-supplier": "file",
  "/reports/profit-loss": "trend",
  "/reports/top-debtors": "alert",
  "/reports/expenses": "receipt",
  "/reports/vat-collected": "percent",
  "/reports/invoice-payments": "tag",
  "/reports/ar-aging": "calendar",
  "/reports/kra-receipts": "book",
  "/reports/leave-balance": "clipboard",
  "/reports/payroll-summary": "receipt",
  "/reports/statutory-deductions": "percent",
  "/reports/bank-transfer": "wallet",
  "/reports/staff-turnover": "swap",
  "/reports/headcount": "hr",
  "/reports/contract-expiry": "alert",
  "/reports/hr-dashboard-kpi": "dashboard",

  // Administration
  "/admin": "dashboard",
  "/admin/company": "building",
  "/admin/branches": "map",
  "/admin/users": "users",
  "/admin/roles": "shield",
  "/admin/audit": "book",
  "/admin/payment-methods": "wallet",
  "/admin/kra-responses": "file",
  "/admin/settings": "settings",
};

/** Order workflow queue slugs → icon. */
/** @type {Record<string, NavIconKey>} */
export const ORDER_QUEUE_ICONS = {
  all: "list",
  booked: "calendar",
  pending: "clock",
  unpaid: "alert",
  pending_payment: "percent",
  paid: "wallet",
  processed: "package",
  delivered: "logistics",
  completed: "check",
  draft: "file",
  held: "clipboard",
  cancelled: "return",
  mobile: "mobile",
};

/**
 * @param {string} href
 * @returns {NavIconKey | undefined}
 */
export function resolveNavHrefIcon(href) {
  if (!href) return undefined;

  if (NAV_HREF_ICONS[href]) {
    return NAV_HREF_ICONS[href];
  }

  const queueMatch = href.match(/^\/sales\/orders\/queues\/([^/]+)$/);
  if (queueMatch) {
    return ORDER_QUEUE_ICONS[queueMatch[1]] ?? "receipt";
  }

  const reportMatch = href.match(/^\/reports\/([^/]+)$/);
  if (reportMatch) {
    return "reports";
  }

  if (href.startsWith("/reports/custom/")) {
    return "file";
  }

  return undefined;
}

/**
 * @param {{ href?: string, icon?: string }} item
 * @returns {typeof item & { icon?: string }}
 */
export function withNavItemIcon(item) {
  if (!item?.href || item.icon) return item;
  const icon = resolveNavHrefIcon(item.href);
  return icon ? { ...item, icon } : item;
}

/**
 * @param {import("@/lib/nav-config").NavSection[]} sections
 */
export function withNavItemIcons(sections) {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) => withNavItemIcon(item)),
  }));
}
