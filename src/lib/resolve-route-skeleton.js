/** @typedef {'list' | 'detail' | 'dashboard' | 'form' | 'report' | 'workspace' | 'pos'} RouteSkeletonVariant */

const MODULE_LABELS = {
  dashboard: "Dashboard",
  lpo: "Purchase orders",
  suppliers: "Suppliers",
  customers: "Customers",
  products: "Products",
  sales: "Sales",
  inventory: "Inventory",
  fulfillment: "Fulfillment",
  hr: "Human resources",
  accounting: "Accounting",
  reports: "Reports",
  admin: "Administration",
  platform: "Platform",
  expenses: "Expenses",
  categories: "Categories",
  uoms: "Units of measure",
  vats: "VAT rates",
  profile: "Profile",
};

const DETAIL_PATTERNS = [
  /^\/lpo\/\d+/,
  /^\/suppliers\/\d+/,
  /^\/customers\/\d+/,
  /^\/products\/[^/]+$/,
  /^\/sales\/orders\/\d+/,
  /^\/sales\/returns\/\d+/,
  /^\/hr\/employees\/\d+/,
  /^\/hr\/payroll\/runs\/\d+/,
  /^\/fulfillment\/trips\/\d+/,
  /^\/fulfillment\/routes\/\d+/,
  /^\/fulfillment\/drivers\/\d+/,
  /^\/fulfillment\/vehicles\/\d+/,
  /^\/inventory\/stock-take\/\d+/,
  /^\/inventory\/receipts\/[^/]+$/,
  /^\/accounting\/journal-entries\/\d+/,
  /^\/accounting\/customer-invoices\/\d+/,
  /^\/platform\/organizations\/\d+/,
  /^\/reports\/custom\/\d+/,
];

function primarySegment(pathname) {
  const parts = String(pathname ?? "")
    .split("/")
    .filter(Boolean);
  return parts[0] ?? "dashboard";
}

function moduleLabel(pathname) {
  const seg = primarySegment(pathname);
  return MODULE_LABELS[seg] ?? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pick a skeleton layout from the destination path (not the current page).
 * @param {string | null | undefined} pathname
 * @returns {{ variant: RouteSkeletonVariant, title: string, subtitle: string }}
 */
export function resolveRouteSkeleton(pathname) {
  const path = String(pathname ?? "/").split("?")[0] || "/";
  const title = moduleLabel(path);

  if (path === "/dashboard" || path === "/") {
    return { variant: "dashboard", title: "Dashboard", subtitle: "Overview and key metrics" };
  }

  if (path === "/sales/pos") {
    return { variant: "pos", title: "Create order", subtitle: "Point of sale" };
  }

  if (path === "/admin" || path === "/admin/") {
    return { variant: "workspace", title: "Admin home", subtitle: "Company setup and access control" };
  }

  if (path.startsWith("/admin/")) {
    return { variant: "workspace", title: "Administration", subtitle: "Loading administration…" };
  }

  if (/\/new$/.test(path) || /\/edit$/.test(path) || /\/receive$/.test(path)) {
    const action = /\/edit$/.test(path) ? "Edit" : /\/receive$/.test(path) ? "Receive" : "New";
    return { variant: "form", title: `${action} · ${title}`, subtitle: "Loading form…" };
  }

  if (path.startsWith("/reports/") && path !== "/reports") {
    return { variant: "report", title: "Report", subtitle: "Preparing report view…" };
  }

  if (DETAIL_PATTERNS.some((pattern) => pattern.test(path))) {
    return { variant: "detail", title, subtitle: "Loading record details…" };
  }

  return { variant: "list", title, subtitle: "Loading list…" };
}
