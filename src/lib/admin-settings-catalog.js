import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { isOrgSettingsTabVisible } from "@/lib/org-settings-tabs";
import { P } from "@/lib/permission-codes";

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description?: string,
 *   keywords?: string[],
 *   group: string,
 *   path: string,
 *   href: string,
 *   orgTab?: string,
 *   navHref?: string,
 *   permission?: string,
 *   permissionAny?: string[],
 * }} AdminSettingEntry
 */

/** @type {AdminSettingEntry[]} */
export const ADMIN_SETTINGS_CATALOG = [
  // —— Admin pages ——
  {
    id: "page.company",
    label: "Company profile",
    description: "Legal name, registration details, and logo",
    keywords: ["company", "logo", "organization", "pin", "kra pin", "address"],
    group: "Organization",
    path: "Admin → Company profile",
    href: "/admin/company",
    navHref: "/admin/company",
    permission: P.admin.company.view,
  },
  {
    id: "page.themes",
    label: "Centrix ERP Themes",
    description: "Sidebar colors, buttons, and External POS palette",
    keywords: ["theme", "colors", "branding", "classic pos", "external pos theme"],
    group: "Organization",
    path: "Admin → Centrix ERP Themes",
    href: "/admin/themes",
    navHref: "/admin/themes",
    permission: P.admin.settings.view,
  },
  {
    id: "page.branches",
    label: "Branches",
    description: "Store locations, contacts, and branch managers",
    keywords: ["branch", "shop", "store", "location", "multi-branch"],
    group: "Organization",
    path: "Admin → Branches",
    href: "/admin/branches",
    navHref: "/admin/branches",
    permission: P.admin.branches.view,
  },
  {
    id: "page.users",
    label: "Users",
    description: "Create users, assign branches and roles",
    keywords: ["user", "cashier", "staff", "login", "account"],
    group: "Users & access",
    path: "Admin → Users",
    href: "/admin/users",
    navHref: "/admin/users",
    permission: P.admin.users.view,
  },
  {
    id: "page.roles",
    label: "Roles & permissions",
    description: "Role templates and permission matrix",
    keywords: ["role", "permission", "rbac", "access", "rights"],
    group: "Users & access",
    path: "Admin → Roles and permissions",
    href: "/admin/roles",
    navHref: "/admin/roles",
    permission: P.admin.roles.view,
  },
  {
    id: "page.audit",
    label: "Audit logs",
    description: "Who changed what across the organization",
    keywords: ["audit", "log", "history", "trail", "activity"],
    group: "Users & access",
    path: "Admin → Audit logs",
    href: "/admin/audit",
    navHref: "/admin/audit",
    permission: P.admin.audit.view,
  },
  {
    id: "page.license",
    label: "License Information",
    description: "Plan, invoice, and contract documents",
    keywords: ["license", "subscription", "plan", "billing"],
    group: "Organization",
    path: "Admin → License Information",
    href: "/admin/license",
    navHref: "/admin/license",
  },
  {
    id: "page.payment-methods",
    label: "Payment methods",
    description: "Cash, M-Pesa, bank, cheque, and other tenders",
    keywords: ["payment method", "tender", "cash", "cheque", "bank"],
    group: "Finance",
    path: "Admin → Finance → Payment methods",
    href: "/admin/payment-methods",
    navHref: "/admin/payment-methods",
  },
  {
    id: "page.kra-settings",
    label: "KRA settings",
    description: "Fiscal device connection and tax receipt signing",
    keywords: ["kra", "etims", "fiscal", "device", "invoice", "plu", "vscu"],
    group: "Tax",
    path: "Admin → Tax → KRA settings",
    href: "/admin/kra-settings",
    navHref: "/admin/kra-settings",
  },
  {
    id: "page.mpesa-settings",
    label: "M-Pesa settings",
    description: "Daraja credentials, STK push, and C2B reconciliation",
    keywords: ["mpesa", "m-pesa", "daraja", "stk", "c2b", "paybill", "lipa"],
    group: "Finance",
    path: "Admin → Finance → M-Pesa settings",
    href: "/admin/mpesa-settings",
    navHref: "/admin/mpesa-settings",
  },
  {
    id: "page.mpesa-paybills",
    label: "M-Pesa Paybills",
    description: "Paybill / till shortcodes for routes and shops",
    keywords: ["paybill", "shortcode", "till number", "store number", "multi paybill"],
    group: "Finance",
    path: "Admin → Finance → M-Pesa Paybills",
    href: "/admin/mpesa-paybills",
    navHref: "/admin/mpesa-paybills",
  },
  {
    id: "page.equity-accounts",
    label: "Equity Bank accounts",
    description: "Equity paybill / collection accounts for routes",
    keywords: ["equity", "bank", "paybill", "collection", "reconciliation"],
    group: "Finance",
    path: "Admin → Finance → Equity Bank accounts",
    href: "/admin/equity-accounts",
    navHref: "/admin/equity-accounts",
  },
  {
    id: "page.till-printing",
    label: "Local printing",
    description: "Till receipt printer pairing and local print bridge",
    keywords: ["printer", "thermal", "receipt printer", "local print", "qz"],
    group: "Organization",
    path: "Admin → Local printing",
    href: "/admin/till-printing",
    navHref: "/admin/till-printing",
  },
  {
    id: "page.attendance-clock",
    label: "Attendance clock-in",
    description: "Hikvision and other clock devices",
    keywords: ["attendance", "clock", "hikvision", "fingerprint", "biometric"],
    group: "Organization",
    path: "Admin → Attendance clock-in",
    href: "/admin/attendance-clock",
    navHref: "/admin/attendance-clock",
  },
  {
    id: "page.hotel-settings",
    label: "Hotel F&B settings",
    description: "Hospitality front desk and F&B preferences",
    keywords: ["hotel", "hospitality", "fnb", "front desk", "rooms"],
    group: "Organization",
    path: "Admin → Hotel F&B settings",
    href: "/admin/hotel-settings",
    navHref: "/admin/hotel-settings",
  },

  // —— Organization settings tabs ——
  {
    id: "org.general",
    label: "General settings",
    description: "Company-wide defaults and admin preferences",
    keywords: ["general", "defaults", "organization settings"],
    group: "Organization settings",
    path: "Organization settings → General",
    href: "/admin/settings?tab=general",
    orgTab: "general",
    permission: P.admin.settings.view,
  },
  {
    id: "org.printouts",
    label: "Printouts",
    description: "Receipt, invoice, and document print layouts",
    keywords: ["printout", "receipt", "invoice layout", "thermal", "a4", "footer"],
    group: "Organization settings",
    path: "Organization settings → Printouts",
    href: "/admin/settings?tab=printouts",
    orgTab: "printouts",
    permission: P.admin.settings.view,
  },
  {
    id: "org.sales",
    label: "Sales settings",
    description: "Prices, discounts, payments, and tills",
    keywords: ["sales", "pos", "checkout", "discount", "till"],
    group: "Organization settings",
    path: "Organization settings → Sales",
    href: "/admin/settings?tab=sales",
    orgTab: "sales",
    permission: P.admin.settings.view,
  },
  {
    id: "org.sales.checkout",
    label: "Prices & discounts",
    description: "Route markup, discounts, vouchers, and tax defaults",
    keywords: [
      "discount",
      "markup",
      "voucher",
      "points",
      "unit price",
      "tax rate",
      "route markup",
    ],
    group: "Organization settings",
    path: "Organization settings → Sales → Prices & discounts",
    href: "/admin/settings?tab=sales&section=checkout",
    orgTab: "sales",
    permission: P.admin.settings.view,
  },
  {
    id: "org.sales.formulas",
    label: "Markup price formulas",
    description: "How route / POS markup prices are calculated",
    keywords: ["markup formula", "pricing formula", "route price"],
    group: "Organization settings",
    path: "Organization settings → Sales → Markup price formulas",
    href: "/admin/settings?tab=sales&section=formulas",
    orgTab: "sales",
    permission: P.admin.settings.view,
  },
  {
    id: "org.sales.payment",
    label: "Recording payments",
    description: "Collect small payments, M-Pesa / bank / cheque fields",
    keywords: [
      "collect small payments",
      "partial payment",
      "installment",
      "payment date",
      "mpesa field",
      "cheque number",
      "bank type",
    ],
    group: "Organization settings",
    path: "Organization settings → Sales → Recording payments",
    href: "/admin/settings?tab=sales&section=payment",
    orgTab: "sales",
    permission: P.admin.settings.view,
  },
  {
    id: "org.sales.pos",
    label: "Tills",
    description: "Till float, barcode, customer name, credit checkout",
    keywords: [
      "till float",
      "float",
      "barcode",
      "scanner",
      "credit customer",
      "credit sales",
      "invoice mode",
      "hold customer name",
      "walk-in name",
      "expected cash",
    ],
    group: "Organization settings",
    path: "Organization settings → Sales → Tills",
    href: "/admin/settings?tab=sales&section=pos",
    orgTab: "sales",
    permission: P.admin.settings.view,
  },
  {
    id: "org.mobile",
    label: "Mobile application",
    description: "Field sales and mobile order preferences",
    keywords: ["mobile", "app", "field sales", "van sales"],
    group: "Organization settings",
    path: "Organization settings → Mobile application",
    href: "/admin/settings?tab=mobile",
    orgTab: "mobile",
    permission: P.admin.settings.view,
  },
  {
    id: "org.distribution",
    label: "Distribution settings",
    description: "Drivers, routes, trips, loading, and delivery cash",
    keywords: ["distribution", "route", "driver", "trip", "loading list", "delivery"],
    group: "Organization settings",
    path: "Organization settings → Distribution",
    href: "/admin/settings?tab=distribution",
    orgTab: "distribution",
    permission: P.admin.settings.view,
  },
  {
    id: "org.distribution.routes",
    label: "Drivers & routes",
    description: "Route assignment and driver preferences",
    keywords: ["drivers", "routes", "van"],
    group: "Organization settings",
    path: "Organization settings → Distribution → Drivers & routes",
    href: "/admin/settings?tab=distribution&section=routes",
    orgTab: "distribution",
    permission: P.admin.settings.view,
  },
  {
    id: "org.distribution.trips",
    label: "Trips & loading",
    description: "Trip charts and loading list options",
    keywords: ["trips", "loading", "loading list", "trip chart"],
    group: "Organization settings",
    path: "Organization settings → Distribution → Trips & loading",
    href: "/admin/settings?tab=distribution&section=trips",
    orgTab: "distribution",
    permission: P.admin.settings.view,
  },
  {
    id: "org.distribution.delivery",
    label: "Delivery & cash",
    description: "Delivery confirmation and cash collection",
    keywords: ["delivery", "cash collection", "delivery cash"],
    group: "Organization settings",
    path: "Organization settings → Distribution → Delivery & cash",
    href: "/admin/settings?tab=distribution&section=delivery",
    orgTab: "distribution",
    permission: P.admin.settings.view,
  },
  {
    id: "org.manager-approvals",
    label: "Manager approvals",
    description: "Approval workflows for discounts, returns, and overrides",
    keywords: ["approval", "manager", "authorize", "override", "return approval"],
    group: "Organization settings",
    path: "Organization settings → Manager approvals",
    href: "/admin/settings?tab=manager-approvals",
    orgTab: "manager-approvals",
    permission: P.admin.settings.view,
  },
  {
    id: "org.inventory",
    label: "Inventory settings",
    description: "Stock alerts, selling mode, and stock locations",
    keywords: ["inventory", "stock", "warehouse", "negative stock", "reorder"],
    group: "Organization settings",
    path: "Organization settings → Inventory",
    href: "/admin/settings?tab=inventory",
    orgTab: "inventory",
    permission: P.admin.settings.view,
  },
  {
    id: "org.inventory.alerts",
    label: "Stock alerts",
    description: "Low stock and reorder alert behaviour",
    keywords: ["stock alert", "low stock", "reorder level"],
    group: "Organization settings",
    path: "Organization settings → Inventory → Stock alerts",
    href: "/admin/settings?tab=inventory&section=alerts",
    orgTab: "inventory",
    permission: P.admin.settings.view,
  },
  {
    id: "org.inventory.selling",
    label: "How you sell",
    description: "Inventory rules when selling (hospitality / retail)",
    keywords: ["how you sell", "stock deduction", "sell from"],
    group: "Organization settings",
    path: "Organization settings → Inventory → How you sell",
    href: "/admin/settings?tab=inventory&section=selling",
    orgTab: "inventory",
    permission: P.admin.settings.view,
  },
  {
    id: "org.inventory.locations",
    label: "Stock locations",
    description: "Receive and default stock location behaviour",
    keywords: ["stock location", "receive location", "warehouse location"],
    group: "Organization settings",
    path: "Organization settings → Inventory → Stock locations",
    href: "/admin/settings?tab=inventory&section=locations",
    orgTab: "inventory",
    permission: P.admin.settings.view,
  },
  {
    id: "org.procurement",
    label: "Procurement settings",
    description: "Purchasing and LPO preferences",
    keywords: ["procurement", "purchase", "lpo", "supplier order"],
    group: "Organization settings",
    path: "Organization settings → Procurement",
    href: "/admin/settings?tab=procurement",
    orgTab: "procurement",
    permission: P.admin.settings.view,
  },
  {
    id: "org.hr",
    label: "HR & Payroll settings",
    description: "Leave, payroll, attendance, and clock devices",
    keywords: ["hr", "payroll", "leave", "attendance", "salary"],
    group: "Organization settings",
    path: "Organization settings → HR & Payroll",
    href: "/admin/settings?tab=hr",
    orgTab: "hr",
    permission: P.admin.settings.view,
  },
  {
    id: "org.hr.leave",
    label: "Time off",
    description: "Leave types and time-off rules",
    keywords: ["leave", "time off", "holiday", "annual leave"],
    group: "Organization settings",
    path: "Organization settings → HR & Payroll → Time off",
    href: "/admin/settings?tab=hr&section=leave",
    orgTab: "hr",
    permission: P.admin.settings.view,
  },
  {
    id: "org.hr.payroll",
    label: "Payroll",
    description: "Payroll period and deduction preferences",
    keywords: ["payroll", "salary", "payslip", "cash advance"],
    group: "Organization settings",
    path: "Organization settings → HR & Payroll → Payroll",
    href: "/admin/settings?tab=hr&section=payroll",
    orgTab: "hr",
    permission: P.admin.settings.view,
  },
  {
    id: "org.hr.attendance",
    label: "Attendance",
    description: "Attendance tracking preferences",
    keywords: ["attendance settings", "timesheet", "clock in"],
    group: "Organization settings",
    path: "Organization settings → HR & Payroll → Attendance",
    href: "/admin/settings?tab=hr&section=attendance",
    orgTab: "hr",
    permission: P.admin.settings.view,
  },
  {
    id: "org.hr.devices",
    label: "Clock-in devices",
    description: "Fingerprint / face terminals for attendance",
    keywords: ["clock device", "biometric", "fingerprint terminal", "face scan"],
    group: "Organization settings",
    path: "Organization settings → HR & Payroll → Clock-in devices",
    href: "/admin/settings?tab=hr&section=devices",
    orgTab: "hr",
    permission: P.admin.settings.view,
  },
  {
    id: "org.notifications",
    label: "Messaging",
    description: "SMS, email, customer alerts, and in-app notifications",
    keywords: ["sms", "email", "smtp", "notification", "messaging", "alert"],
    group: "Organization settings",
    path: "Organization settings → Messaging",
    href: "/admin/settings?tab=notifications",
    orgTab: "notifications",
    permission: P.admin.settings.view,
  },
  {
    id: "org.notifications.sms",
    label: "Text messages (SMS)",
    description: "SMS gateway and outbound text settings",
    keywords: ["sms", "text message", "gateway", "africastalking"],
    group: "Organization settings",
    path: "Organization settings → Messaging → Text messages (SMS)",
    href: "/admin/settings?tab=notifications&section=sms",
    orgTab: "notifications",
    permission: P.admin.settings.view,
  },
  {
    id: "org.notifications.email",
    label: "Email setup",
    description: "SMTP / outbound email configuration",
    keywords: ["email", "smtp", "mail", "2fa email"],
    group: "Organization settings",
    path: "Organization settings → Messaging → Email setup",
    href: "/admin/settings?tab=notifications&section=email",
    orgTab: "notifications",
    permission: P.admin.settings.view,
  },
  {
    id: "org.notifications.customer",
    label: "Customer alerts",
    description: "Notify customers about orders and balances",
    keywords: ["customer alert", "debtor sms", "order notification"],
    group: "Organization settings",
    path: "Organization settings → Messaging → Customer alerts",
    href: "/admin/settings?tab=notifications&section=customer",
    orgTab: "notifications",
    permission: P.admin.settings.view,
  },
  {
    id: "org.notifications.in_app",
    label: "In-app alerts",
    description: "Bell notifications inside the ERP",
    keywords: ["in-app", "bell", "toast", "notification center"],
    group: "Organization settings",
    path: "Organization settings → Messaging → In-app alerts",
    href: "/admin/settings?tab=notifications&section=in_app",
    orgTab: "notifications",
    permission: P.admin.settings.view,
  },
  {
    id: "org.security",
    label: "Security settings",
    description: "Sign-in, screen lock, and password rules",
    keywords: ["security", "password", "screen lock", "session", "2fa", "mfa"],
    group: "Organization settings",
    path: "Organization settings → Security",
    href: "/admin/settings?tab=security",
    orgTab: "security",
    permission: P.admin.settings.view,
  },
  {
    id: "org.security.sessions",
    label: "Sign-in & screen lock",
    description: "Idle lock and session behaviour",
    keywords: ["screen lock", "idle", "sign-in", "session timeout", "auto lock"],
    group: "Organization settings",
    path: "Organization settings → Security → Sign-in & screen lock",
    href: "/admin/settings?tab=security&section=sessions",
    orgTab: "security",
    permission: P.admin.settings.view,
  },
  {
    id: "org.security.passwords",
    label: "Password rules",
    description: "Minimum length and password complexity",
    keywords: ["password policy", "password rules", "complexity"],
    group: "Organization settings",
    path: "Organization settings → Security → Password rules",
    href: "/admin/settings?tab=security&section=passwords",
    orgTab: "security",
    permission: P.admin.settings.view,
  },
];

let adminNavByHrefCache = null;

function getAdminNavByHref() {
  if (!adminNavByHrefCache) {
    adminNavByHrefCache = new Map(
      navSections
        .filter((section) => String(section.id ?? "").startsWith("admin"))
        .flatMap((section) => section.items ?? [])
        .map((item) => [item.href, item]),
    );
  }
  return adminNavByHrefCache;
}

/**
 * @param {AdminSettingEntry} entry
 * @param {{
 *   capabilities?: object,
 *   hasPermission?: (code: string) => boolean,
 *   navContext?: object,
 * }} ctx
 */
export function isAdminSettingEntryVisible(entry, ctx = {}) {
  const { capabilities, hasPermission, navContext } = ctx;

  if (entry.permissionAny?.length) {
    if (typeof hasPermission === "function" && !entry.permissionAny.some((code) => hasPermission(code))) {
      return false;
    }
  } else if (entry.permission && typeof hasPermission === "function" && !hasPermission(entry.permission)) {
    return false;
  }

  if (entry.orgTab && capabilities) {
    if (!isOrgSettingsTabVisible(entry.orgTab, capabilities, { tenantSelfService: true })) {
      return false;
    }
  }

  if (entry.navHref && navContext) {
    const navItem = getAdminNavByHref().get(entry.navHref);
    if (navItem && !isNavItemVisible(navItem, navContext)) {
      return false;
    }
  }

  return true;
}

/**
 * @param {object} [ctx]
 * @returns {AdminSettingEntry[]}
 */
export function visibleAdminSettingsCatalog(ctx = {}) {
  return ADMIN_SETTINGS_CATALOG.filter((entry) => isAdminSettingEntryVisible(entry, ctx));
}

function scoreAdminSettingEntry(entry, query) {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const label = entry.label.toLowerCase();
  const description = String(entry.description ?? "").toLowerCase();
  const path = entry.path.toLowerCase();
  const group = entry.group.toLowerCase();
  const keywords = (entry.keywords ?? []).map((k) => String(k).toLowerCase());
  const haystack = [label, description, path, group, ...keywords].join(" ");

  let score = 0;
  if (label === q) score = 120;
  else if (label.startsWith(q)) score = 100;
  else if (label.includes(q)) score = 80;
  else if (keywords.some((k) => k === q)) score = 75;
  else if (keywords.some((k) => k.startsWith(q) || k.includes(q))) score = 65;
  else if (description.includes(q) || path.includes(q)) score = 50;
  else if (haystack.includes(q)) score = 40;
  else {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) {
      score = 55;
    } else {
      return 0;
    }
  }

  // Prefer deeper setting hits over page-level duplicates when keywords match.
  if (entry.href.includes("section=")) score += 3;
  return score;
}

/**
 * Smart search over Admin settings. Returns ranked destinations with path hints.
 *
 * @param {string} query
 * @param {{
 *   capabilities?: object,
 *   hasPermission?: (code: string) => boolean,
 *   navContext?: object,
 *   limit?: number,
 * }} [options]
 * @returns {Array<AdminSettingEntry & { score: number }>}
 */
export function searchAdminSettings(query, options = {}) {
  const limit = options.limit ?? 12;
  const q = String(query ?? "").trim();
  if (q.length < 1) return [];

  const entries = visibleAdminSettingsCatalog(options);
  const scored = [];

  for (const entry of entries) {
    const score = scoreAdminSettingEntry(entry, q);
    if (score <= 0) continue;
    scored.push({ ...entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  const results = [];
  const seen = new Set();
  for (const row of scored) {
    if (seen.has(row.href)) continue;
    seen.add(row.href);
    results.push(row);
    if (results.length >= limit) break;
  }
  return results;
}

/** Map catalog hits into GlobalModuleSearch / nav-style entries. */
export function adminSettingsToNavEntries(results) {
  return results.map((entry) => ({
    id: entry.id,
    kind: "link",
    label: entry.label,
    href: entry.href,
    section: entry.group,
    group: entry.path,
    keywords: (entry.keywords ?? []).join(" "),
  }));
}
