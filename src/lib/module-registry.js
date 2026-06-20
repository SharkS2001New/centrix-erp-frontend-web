/** Report page slug => reports module key (mirrors config/erp_module_tree.php report_modules). */
export const REPORT_MODULE_BY_SLUG = {
  "daily-sales": "sales.reports",
  "sales-by-product": "sales.reports",
  "sales-by-user": "sales.reports",
  "sales-by-customer": "sales.reports",
  "sales-by-channel": "sales.reports",
  "mobile-route-sales": "distribution.reports",
  "dispatch-trips": "distribution.reports",
  "trip-cash-settlement": "distribution.reports",
  "pod-compliance": "distribution.reports",
  "driver-deliveries": "distribution.reports",
  "sales-pipeline": "sales.reports",
  "vat-collected": "sales.reports",
  "category-sales": "sales.reports",
  "discount-summary": "sales.reports",
  "payment-collection": "sales.reports",
  "credit-outstanding": "sales.reports",
  "till-sessions": "sales.reports",
  "eod-cashier": "sales.reports",
  "eod-report": "sales.reports",
  returns: "sales.reports",

  "stock-on-hand": "inventory.reports",
  "low-stock": "inventory.reports",
  "stock-movement": "inventory.reports",
  "stock-chain": "inventory.reports",
  "stock-valuation": "inventory.reports",
  "stock-reservations": "inventory.reports",
  "stock-receipts": "inventory.reports",
  "stock-transfers": "inventory.reports",
  damages: "inventory.reports",
  "price-list": "inventory.reports",

  "profit-loss": "accounting.reports",
  "top-debtors": "accounting.reports",
  expenses: "accounting.reports",
  "ar-aging": "accounting.reports",
  "invoice-payments": "accounting.reports",
  "journal-register": "accounting.reports",
  "general-ledger": "accounting.reports",
  "trial-balance": "accounting.reports",
  "balance-sheet": "accounting.reports",
  "profit-loss-gl": "accounting.reports",
  "cash-flow": "accounting.reports",
  "accounts-receivable": "accounting.reports",
  "accounts-payable": "accounting.reports",
  "subledger-reconciliation": "accounting.reports",
  "kra-receipts": "accounting.reports",
  "customer-statement": "customers_suppliers",
  "supplier-statement": "customers_suppliers",

  "purchases-by-supplier": "customers_suppliers.reports",
  "open-lpo": "customers_suppliers.reports",
  "supplier-returns": "customers_suppliers.reports",

  "payroll-summary": "hr_payroll.reports",
  "leave-balance": "hr_payroll.reports",
  "statutory-deductions": "hr_payroll.reports",
  "bank-transfer": "hr_payroll.reports",
  "staff-turnover": "hr_payroll.reports",
  headcount: "hr_payroll.reports",
  "contract-expiry": "hr_payroll.reports",
  "hr-dashboard-kpi": "hr_payroll.reports",
};

/** @param {string} slug */
export function reportModuleForSlug(slug) {
  return REPORT_MODULE_BY_SLUG[slug] ?? null;
}

/** @param {Record<string, boolean>} modules */
export function anyReportsModuleEnabled(modules) {
  return Object.entries(modules ?? {}).some(
    ([key, on]) => on && key.endsWith(".reports"),
  );
}

/** Domain roots shown first in platform module toggles. */
export const DOMAIN_MODULE_ORDER = [
  "sales",
  "inventory",
  "customers_suppliers",
  "accounting",
  "hr_payroll",
  "distribution",
  "admin",
];

/** Module keys gated by the distribution domain. */
export const DISTRIBUTION_MODULE_KEYS = [
  "distribution",
  "distribution.dashboard",
  "distribution.reports",
];

/**
 * @param {Array<{ key: string, kind?: string, children?: string[] }>} moduleOptions
 * @returns {Map<string, string[]>}
 */
export function buildDomainChildrenMap(moduleOptions) {
  const map = new Map();
  for (const mod of moduleOptions ?? []) {
    if (mod.kind !== "domain") continue;
    const childKeys = mod.children?.length
      ? mod.children
      : (moduleOptions ?? []).filter((m) => m.parent === mod.key).map((m) => m.key);
    map.set(mod.key, [mod.key, ...childKeys.filter((k) => k !== mod.key)]);
  }
  return map;
}

/**
 * @param {Record<string, boolean>} previous
 * @param {Record<string, boolean>} partial
 * @param {Map<string, string[]> | null} [domainChildrenMap]
 */
export function patchEnabledModules(previous, partial, domainChildrenMap = null, mobileOrdersEnabled = true) {
  const next = { ...previous };

  for (const [key, value] of Object.entries(partial)) {
    if (domainChildrenMap?.has(key)) {
      next[key] = value;
      if (!value) {
        for (const childKey of domainChildrenMap.get(key) ?? []) {
          next[childKey] = false;
        }
      }
      continue;
    }
    next[key] = value;
  }

  const distributionTouched = DISTRIBUTION_MODULE_KEYS.some((key) => key in partial);
  const distributionOn = DISTRIBUTION_MODULE_KEYS.some((key) => next[key]);

  if (distributionTouched && distributionOn) {
    next["sales.mobile"] = true;
    next.sales = true;
  }

  if (!next["sales.mobile"] || !mobileOrdersEnabled) {
    for (const key of DISTRIBUTION_MODULE_KEYS) {
      next[key] = false;
    }
  }

  return next;
}

/**
 * @param {Record<string, boolean>} modules
 * @param {Map<string, string[]>} domainChildrenMap
 */
export function isDomainFullyEnabled(modules, domainKey, domainChildrenMap) {
  const keys = domainChildrenMap.get(domainKey) ?? [domainKey];
  return keys.every((key) => Boolean(modules[key]));
}

/**
 * Collapse partial domain states to whole-module on/off (domain on if any child was on).
 *
 * @param {Record<string, boolean>} modules
 * @param {Map<string, string[]>} domainChildrenMap
 */
export function normalizeDomainModules(modules, domainChildrenMap) {
  const next = { ...modules };

  for (const [domain, keys] of domainChildrenMap.entries()) {
    const children = keys.filter((key) => key !== domain);
    const anyChildOn = children.some((key) => next[key]);
    const domainOn = Boolean(next[domain]) || anyChildOn;
    next[domain] = domainOn;

    if (!domainOn) {
      for (const key of keys) {
        next[key] = false;
      }
    }
  }

  return patchEnabledModules(next, {}, domainChildrenMap);
}
