import { formatNavLabel } from "@/lib/nav-label-format";

/** @typedef {string} NavIconKey */

/** Exact href → icon (most specific wins). */
/** @type {Record<string, NavIconKey>} */
export const NAV_HREF_ICONS = {
  // Platform
  "/platform": "platform",
  "/platform/ai-training": "star",
  "/platform/whatsapp": "chat",
  "/platform/invoices": "receipt",
  "/platform/invoice-templates": "package",
  "/platform/plans": "package",
  "/platform/subscriptions": "clock",
  "/platform/contracts": "file",
  "/platform/email": "chat",
  "/platform/mailbox": "chat",
  "/platform/settings": "chat",
  "/platform/active-users": "users",
  "/platform/system-issues": "alert",
  "/platform/database-backups": "database",
  "/platform/legacy-import-converter": "upload",
  "/platform/organizations": "building",
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
  "/admin/till-printing": "receipt",

  // Pricing & tax
  "/vats": "percent",
  "/price-history": "trend",

  // Sales & orders
  "/sales/orders": "list",
  "/sales/whatsapp": "chat",

  // Field sales
  "/sales/orders/queues/mobile": "mobile",
  "/sales/loading-sheets": "clipboard",
  "/sales/picking-lists": "clipboard",
  "/notifications": "bell",
  "/sales/field-attendance": "map",

  // After sales
  "/sales/returns": "return",
  "/sales/reservations": "calendar",

  // Legacy (old system)
  "/reports/legacy-archive": "archive",
  "/sales/legacy-orders": "list",
  "/sales/legacy-returns": "return",

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
  "/reports/items-currently-in-stock": "inventory",

  // Stock movements
  "/inventory/transfers": "swap",
  "/inventory/transfers/new": "plus",
  "/inventory/receipts": "package",
  "/inventory/adjustments": "edit",
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
  "/accounting/bank-register": "wallet",
  "/accounting/bank-reconciliation": "link",
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
  "/hr/field-attendance": "map",
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
  "/fulfillment/loading-lists": "logistics",
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
  "/reports/sales-by-supplier": "truck",
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
  "/admin/license": "shield",
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
  if (!item?.href) return item;
  const next = {
    ...item,
    label: item.label ? formatNavLabel(item.label) : item.label,
    group: item.group ? formatNavLabel(item.group) : item.group,
  };
  if (next.icon) return next;
  const icon = resolveNavHrefIcon(next.href);
  return icon ? { ...next, icon } : next;
}

/**
 * @param {import("@/lib/nav-config").NavSection[]} sections
 */
export function withNavItemIcons(sections) {
  return sections.map((section) => ({
    ...section,
    label: section.label ? formatNavLabel(section.label) : section.label,
    items: section.items.map((item) => withNavItemIcon(item)),
  }));
}
