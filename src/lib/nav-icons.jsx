/** Outline nav icons (Velzon-style). */

import { resolveNavHrefIcon } from "@/lib/nav-item-icons";

function IconBase({ className, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function NavIconDashboard({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="4" />
    </IconBase>
  );
}

export function NavIconSales({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
      <path d="M2 4h2l2.5 12h11l2-8H6" />
    </IconBase>
  );
}

export function NavIconInventory({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M21 8l-9-4-9 4v8l9 4 9-4V8z" />
      <path d="M3 8l9 4 9-4M12 12v8" />
    </IconBase>
  );
}

export function NavIconPurchases({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M6 2h12v20H6z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </IconBase>
  );
}

export function NavIconLogistics({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h4l3 3v2h-7V10z" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </IconBase>
  );
}

export function NavIconReports({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15V9M12 15V7M16 15v-4" />
    </IconBase>
  );
}

export function NavIconAccounting({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h6" />
    </IconBase>
  );
}

export function NavIconHr({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </IconBase>
  );
}

export function NavIconUsers({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 2.7-6 7-6" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M14 20c0-2.5 1.8-4.5 4-4.5" />
    </IconBase>
  );
}

export function NavIconSettings({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </IconBase>
  );
}

export function NavIconPlatform({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M2 12h20M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
    </IconBase>
  );
}

export function NavIconLink({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M8 12h8" />
    </IconBase>
  );
}

export function NavIconChart({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16V10M12 16V7M16 16v-3" />
    </IconBase>
  );
}

export function NavIconBox({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3l8 4.5V16.5L12 21l-8-4.5V7.5L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </IconBase>
  );
}

export function NavIconFolder({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
    </IconBase>
  );
}

export function NavIconMeasure({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 8h16M4 16h16M8 4v16M16 4v16" />
    </IconBase>
  );
}

export function NavIconPackage({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" />
      <path d="M12 7v14M4 7l8 4 8-4" />
    </IconBase>
  );
}

export function NavIconReceipt({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M6 4h12v16l-2-1.5L14 20l-2-1.5L10 20l-2-1.5L6 20V4z" />
      <path d="M9 8h6M9 12h6" />
    </IconBase>
  );
}

export function NavIconList({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01" />
    </IconBase>
  );
}

export function NavIconMobile({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </IconBase>
  );
}

export function NavIconReturn({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 010 10h-2" />
    </IconBase>
  );
}

export function NavIconCalendar({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </IconBase>
  );
}

export function NavIconTag({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M20 12l-8 8-9-9V4h7l10 8z" />
      <circle cx="8" cy="8" r="1.5" />
    </IconBase>
  );
}

export function NavIconStar({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19l1-5.8-4.2-4.1 5.9-.9L12 3z" />
    </IconBase>
  );
}

export function NavIconClipboard({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" />
    </IconBase>
  );
}

export function NavIconSwap({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M7 7h11l-3-3M17 17H6l3 3" />
    </IconBase>
  );
}

export function NavIconPlus({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}

export function NavIconAlert({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 18h.01" />
    </IconBase>
  );
}

export function NavIconWallet({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </IconBase>
  );
}

export function NavIconFile({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M8 4h8l4 4v12a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path d="M14 4v4h4" />
    </IconBase>
  );
}

export function NavIconClock({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </IconBase>
  );
}

export function NavIconPercent({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="8" cy="8" r="2" />
      <circle cx="16" cy="16" r="2" />
      <path d="M18 6L6 18" />
    </IconBase>
  );
}

export function NavIconTrend({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 17l5-5 4 4 7-8" />
      <path d="M16 8h4v4" />
    </IconBase>
  );
}

export function NavIconBuilding({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 20V8l8-4 8 4v12" />
      <path d="M9 20v-6h6v6" />
      <path d="M9 10h.01M15 10h.01" />
    </IconBase>
  );
}

export function NavIconTruck({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M3 8h11v8H3z" />
      <path d="M14 10h4l3 3v3h-7v-6z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </IconBase>
  );
}

export function NavIconMap({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V4z" />
      <path d="M9 4v14M15 6v14" />
    </IconBase>
  );
}

export function NavIconBook({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 00-3 3V4z" />
      <path d="M8 4h8a3 3 0 013 3v13" />
    </IconBase>
  );
}

export function NavIconLayers({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
      <path d="M4 12l8 4.5 8-4.5" />
      <path d="M4 16.5l8 4.5 8-4.5" />
    </IconBase>
  );
}

export function NavIconCheck({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M5 12l4 4 10-10" />
    </IconBase>
  );
}

export function NavIconShield({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3l8 3v6c0 4.5-3.2 8.4-8 9-4.8-.6-8-4.5-8-9V6l8-3z" />
    </IconBase>
  );
}

const ITEM_ICON_COMPONENTS = {
  dashboard: NavIconDashboard,
  chart: NavIconChart,
  sales: NavIconSales,
  inventory: NavIconInventory,
  box: NavIconBox,
  folder: NavIconFolder,
  measure: NavIconMeasure,
  package: NavIconPackage,
  receipt: NavIconReceipt,
  list: NavIconList,
  mobile: NavIconMobile,
  clipboard: NavIconClipboard,
  return: NavIconReturn,
  calendar: NavIconCalendar,
  tag: NavIconTag,
  star: NavIconStar,
  swap: NavIconSwap,
  plus: NavIconPlus,
  alert: NavIconAlert,
  wallet: NavIconWallet,
  file: NavIconFile,
  clock: NavIconClock,
  percent: NavIconPercent,
  trend: NavIconTrend,
  purchases: NavIconPurchases,
  logistics: NavIconLogistics,
  reports: NavIconReports,
  accounting: NavIconAccounting,
  hr: NavIconHr,
  users: NavIconUsers,
  settings: NavIconSettings,
  platform: NavIconPlatform,
  link: NavIconLink,
  building: NavIconBuilding,
  truck: NavIconTruck,
  map: NavIconMap,
  book: NavIconBook,
  layers: NavIconLayers,
  check: NavIconCheck,
  shield: NavIconShield,
};

/** Fallback when href is not in the central map. */
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

export function NavItemIcon({ item, sectionId, className = "h-[15px] w-[15px] shrink-0 opacity-85" }) {
  const key = item?.icon ?? resolveNavItemIconKey(item?.href, sectionId);
  const Icon = ITEM_ICON_COMPONENTS[key] ?? NavIconLink;
  return <Icon className={className} />;
}

const SECTION_ICONS = {
  platform: NavIconPlatform,
  dashboard: NavIconDashboard,
  products: NavIconInventory,
  pos: NavIconSales,
  pricing_tax: NavIconAccounting,
  sales_orders: NavIconSales,
  field_sales: NavIconSales,
  after_sales: NavIconSales,
  promotions: NavIconSales,
  customers: NavIconHr,
  inventory: NavIconInventory,
  stock_movements: NavIconInventory,
  suppliers: NavIconPurchases,
  purchase_orders: NavIconPurchases,
  payments_returns: NavIconPurchases,
  distribution_ops: NavIconLogistics,
  distribution_fleet: NavIconLogistics,
  distribution_orders: NavIconSales,
  reports: NavIconReports,
  accounting: NavIconAccounting,
  hr_people: NavIconHr,
  hr_time_attendance: NavIconClock,
  hr_payroll: NavIconWallet,
  hr_performance: NavIconChart,
  admin_dashboard: NavIconDashboard,
  admin_organization: NavIconPlatform,
  admin_users: NavIconUsers,
  admin_finance_tax: NavIconAccounting,
  admin_settings: NavIconSettings,
  users: NavIconUsers,
  settings: NavIconSettings,
};

export function NavSectionIcon({ sectionId, className }) {
  const Icon = SECTION_ICONS[sectionId] ?? NavIconLink;
  return <Icon className={className} />;
}
