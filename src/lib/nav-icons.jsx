/** Sidebar / nav icons via Bootstrap Icons (unified sizing). */

import { resolveNavHrefIcon } from "@/lib/nav-item-icons";

/** @type {Record<string, string>} icon key → bootstrap-icons class suffix (without `bi-`) */
export const NAV_BOOTSTRAP_ICONS = {
  dashboard: "speedometer2",
  chart: "bar-chart-line",
  sales: "cart3",
  inventory: "boxes",
  box: "box",
  folder: "folder2",
  measure: "rulers",
  package: "box-seam",
  receipt: "receipt",
  list: "list-ul",
  mobile: "phone",
  clipboard: "clipboard-check",
  return: "arrow-return-left",
  calendar: "calendar3",
  tag: "tag",
  star: "star",
  swap: "arrow-left-right",
  plus: "plus-lg",
  alert: "exclamation-triangle",
  wallet: "wallet2",
  file: "file-earmark-text",
  clock: "clock",
  percent: "percent",
  trend: "graph-up-arrow",
  purchases: "bag",
  logistics: "truck",
  reports: "file-bar-graph",
  accounting: "journal-bookmark",
  hr: "people",
  users: "person-badge",
  settings: "gear",
  platform: "globe2",
  database: "database-down",
  link: "link-45deg",
  building: "building",
  truck: "truck",
  map: "map",
  book: "journal-text",
  layers: "layers",
  check: "check-circle",
  shield: "shield-lock",
  archive: "archive",
  chat: "chat-dots",
};

const HREF_ICON_FALLBACK_RULES = [
  [/^\/reports\/custom\//, "file"],
  [/^\/reports\//, "reports"],
  [/^\/admin\//, "settings"],
  [/^\/platform\//, "platform"],
];

const SECTION_FALLBACK_ICON = {
  platform: "platform",
  dashboard: "dashboard",
  products: "box",
  pos: "sales",
  pricing_tax: "percent",
  sales_orders: "receipt",
  field_sales: "mobile",
  legacy_system: "archive",
  after_sales: "return",
  promotions: "tag",
  customers: "hr",
  inventory: "inventory",
  stock_movements: "swap",
  suppliers: "purchases",
  purchase_orders: "file",
  payments_returns: "wallet",
  distribution_ops: "logistics",
  distribution_fleet: "truck",
  distribution_orders: "receipt",
  reports: "reports",
  accounting: "accounting",
  hr_people: "hr",
  hr_time_attendance: "clock",
  hr_payroll: "wallet",
  hr_performance: "chart",
  admin_dashboard: "dashboard",
  admin_organization: "platform",
  admin_users: "users",
  admin_finance_tax: "accounting",
  admin_settings: "settings",
  users: "users",
  settings: "settings",
};

const SIZE_CLASS = {
  section: "app-nav-icon-section",
  item: "app-nav-icon-item",
};

/** @param {string} href */
export function resolveNavItemIconKey(href, sectionId) {
  const mapped = resolveNavHrefIcon(href);
  if (mapped) return mapped;

  if (!href) return SECTION_FALLBACK_ICON[sectionId] ?? "link";
  for (const [pattern, key] of HREF_ICON_FALLBACK_RULES) {
    if (pattern.test(href)) return key;
  }
  return SECTION_FALLBACK_ICON[sectionId] ?? "link";
}

export function NavIcon({ iconKey, size = "item", className = "" }) {
  const bi = NAV_BOOTSTRAP_ICONS[iconKey] ?? NAV_BOOTSTRAP_ICONS.link;
  const sizeClass = SIZE_CLASS[size] ?? SIZE_CLASS.item;
  return (
    <i
      className={`bi bi-${bi} app-nav-icon ${sizeClass}${className ? ` ${className}` : ""}`}
      aria-hidden
    />
  );
}

export function NavItemIcon({
  item,
  sectionId,
  className = "",
}) {
  const key = item?.icon ?? resolveNavItemIconKey(item?.href, sectionId);
  return <NavIcon iconKey={key} size="item" className={className} />;
}

export function NavSectionIcon({ sectionId, className = "opacity-90" }) {
  const key = SECTION_FALLBACK_ICON[sectionId] ?? "link";
  return <NavIcon iconKey={key} size="section" className={className} />;
}
