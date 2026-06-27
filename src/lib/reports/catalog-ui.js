/** Route overrides for reports that live outside /reports/{key}. */
export const REPORT_UI_ROUTES = {
  "eod-report": "/sales/end-of-day",
  "eod-cashier": "/sales/end-of-day",
  "customer-statement": "/reports/customer-statement",
  "subledger-reconciliation": "/reports/subledger-reconciliation",
  "legacy-archive": "/reports/legacy-archive",
  "price-list": "/reports/price-list",
};

export function reportHref(key, path) {
  return REPORT_UI_ROUTES[key] ?? path ?? `/reports/${key}`;
}

/** Hub category cards — keys map to API catalog entries. */
export const REPORT_CATEGORY_DEFS = [
  {
    id: "sales",
    title: "Sales Reports",
    description: "Track revenue, transactions, and sales performance",
    icon: "sales",
    keys: [
      "sales-by-product",
      "sales-by-user",
      "sales-by-customer",
      "sales-by-channel",
      "daily-sales",
      "sales-pipeline",
      "category-sales",
    ],
  },
  {
    id: "distribution",
    title: "Distribution Reports",
    description: "Route sales, trips, and delivery performance",
    icon: "logistics",
    keys: [
      "mobile-route-sales",
      "dispatch-trips",
      "trip-cash-settlement",
      "pod-compliance",
      "driver-deliveries",
    ],
  },
  {
    id: "customers",
    title: "Customers & Receivables",
    description: "Customer balances, aging, and collections",
    icon: "customers",
    keys: [
      "customer-statement",
      "ar-aging",
      "credit-outstanding",
      "top-debtors",
      "accounts-receivable",
      "invoice-payments",
    ],
  },
  {
    id: "inventory",
    title: "Inventory Reports",
    description: "Stock levels, movement, and valuation",
    icon: "inventory",
    keys: [
      "stock-on-hand",
      "low-stock",
      "stock-movement",
      "stock-chain",
      "stock-valuation",
      "stock-reservations",
      "stock-transfers",
      "returns",
      "price-list",
    ],
  },
  {
    id: "purchases",
    title: "Purchases Reports",
    description: "Supplier purchases, LPOs, and returns",
    icon: "purchases",
    keys: [
      "open-lpo",
      "purchases-by-supplier",
      "stock-receipts",
      "supplier-returns",
      "damages",
    ],
  },
  {
    id: "pos",
    title: "POS Reports",
    description: "Cashier sessions, till floats, and POS metrics",
    icon: "pos",
    keys: [
      "eod-cashier",
      "eod-report",
      "till-sessions",
      "discount-summary",
      "payment-collection",
      "vat-collected",
    ],
  },
  {
    id: "finance",
    title: "Finance & Accounting",
    description: "P&L, balance sheet, ledger, and expenses",
    icon: "finance",
    keys: [
      "profit-loss",
      "profit-loss-gl",
      "trial-balance",
      "balance-sheet",
      "cash-flow",
      "general-ledger",
      "accounts-payable",
      "expenses",
      "journal-register",
      "subledger-reconciliation",
    ],
  },
  {
    id: "compliance",
    title: "Compliance Reports",
    description: "Tax receipts and audit trail",
    icon: "compliance",
    keys: ["kra-receipts", "audit-trail"],
  },
  {
    id: "hr",
    title: "Payroll & workforce",
    description: "Leave, payroll, headcount, and workforce analytics",
    icon: "payroll",
    keys: [
      "leave-balance",
      "payroll-summary",
      "statutory-deductions",
      "bank-transfer",
      "staff-turnover",
      "headcount",
      "contract-expiry",
      "hr-dashboard-kpi",
    ],
  },
];

/**
 * Build category cards from the API catalog payload.
 * @param {Record<string, Array<{ key: string, label: string, path?: string }>>} catalog
 */
export function buildReportCategories(catalog) {
  const byKey = new Map();
  for (const items of Object.values(catalog ?? {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.key) byKey.set(item.key, item);
    }
  }

  const assigned = new Set();

  const categories = REPORT_CATEGORY_DEFS.map((def) => {
    const reports = def.keys
      .map((key) => {
        const item = byKey.get(key);
        if (!item) return null;
        assigned.add(key);
        return {
          key,
          label: item.label,
          href: reportHref(key, item.path),
        };
      })
      .filter(Boolean);

    return { ...def, reports, count: reports.length };
  }).filter((c) => c.count > 0);

  const uncategorized = [];
  for (const [key, item] of byKey) {
    if (assigned.has(key)) continue;
    uncategorized.push({
      key,
      label: item.label,
      href: reportHref(key, item.path),
    });
  }

  if (uncategorized.length) {
    categories.push({
      id: "other",
      title: "Other Reports",
      description: "Additional operational reports",
      icon: "other",
      reports: uncategorized,
      count: uncategorized.length,
    });
  }

  return categories;
}

export function flattenReports(categories) {
  const seen = new Set();
  const rows = [];
  for (const cat of categories) {
    for (const r of cat.reports) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      rows.push({ ...r, categoryId: cat.id, categoryTitle: cat.title });
    }
  }
  return rows;
}
