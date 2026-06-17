/** Report page slug => reports module key (mirrors config/erp_module_tree.php report_modules). */
export const REPORT_MODULE_BY_SLUG = {
  "daily-sales": "sales.reports",
  "sales-by-product": "sales.reports",
  "sales-by-user": "sales.reports",
  "sales-by-customer": "sales.reports",
  "sales-by-channel": "sales.reports",
  "mobile-route-sales": "sales.reports",
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

  "purchases-by-supplier": "customers_suppliers.reports",
  "open-lpo": "customers_suppliers.reports",
  "supplier-returns": "customers_suppliers.reports",

  "payroll-summary": "hr_payroll.reports",
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
