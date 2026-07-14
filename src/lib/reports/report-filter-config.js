/** Reports with no date range UI or params. */
import { INVENTORY_TRANSACTION_TYPE_LABELS } from "@/lib/user-facing-labels";
import { resolveSalesChannelsFromCapabilities } from "@/lib/sales-channels";

export const REPORTS_WITHOUT_DATE_FILTER = new Set([
  "price-list",
  "low-stock",
  "headcount",
  "items-currently-in-stock",
  "staff-turnover",
  "leave-balance",
  "hr-dashboard-kpi",
]);

/** Default inclusive window length (days ending today) per report. */
export const REPORT_DEFAULT_DATE_RANGE_DAYS = {
  "ar-aging": 6,
  "top-debtors": 6,
  "accounts-receivable": 6,
};

/** Send from_date/to_date but omit date_column (backend applies custom date logic). */
export const REPORTS_DATE_WITHOUT_COLUMN = new Set([
  "sales-by-customer",
  "stock-chain",
  "top-debtors",
  "accounts-receivable",
]);

/** AR / payment reports are org-scoped; branch filter applies via invoice branch. */
export const REPORTS_WITHOUT_BRANCH_FILTER = new Set([
  "top-debtors",
  "open-lpo",
  "purchases-by-supplier",
]);

/** Generic report tables without a page totals footer row. */
export const REPORTS_WITHOUT_TABLE_FOOTER = new Set(["mobile-route-sales"]);

export const SALES_CHANNEL_OPTIONS = [
  { value: "", label: "All channels" },
  { value: "pos", label: "POS" },
  { value: "mobile", label: "Mobile / route" },
  { value: "backend", label: "Backoffice" },
];

export function salesChannelOptionsForCapabilities(capabilities) {
  const allowed = new Set(resolveSalesChannelsFromCapabilities(capabilities));

  return SALES_CHANNEL_OPTIONS.filter((option) => option.value === "" || allowed.has(option.value));
}

export const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All payment statuses" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partially paid" },
  { value: "unpaid", label: "Unpaid" },
];

export const ORDER_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const STOCK_LOCATION_FILTER_OPTIONS = [
  { value: "", label: "All locations" },
  { value: "shop", label: "Shop" },
  { value: "store", label: "Store / warehouse" },
];

export const INVENTORY_LOCATION_OPTIONS = [
  { value: "", label: "Any stock location" },
  { value: "shop", label: "Shop only" },
  { value: "store", label: "Store only" },
];

export const INVENTORY_TXN_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  ...Object.entries(INVENTORY_TRANSACTION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

export function inventoryTransactionTypeOptionsForCapabilities(capabilities) {
  if (capabilities?.modules?.["sales.pos"]) {
    return INVENTORY_TXN_TYPE_OPTIONS;
  }
  return INVENTORY_TXN_TYPE_OPTIONS.filter(
    (option) => option.value === "" || option.value !== "POS_SALE",
  );
}

export const REPORT_DATE_COLUMNS = {
  "sales-by-product": "sale_date",
  "sales-by-supplier": "sale_date",
  "sales-by-user": "sale_date",
  "sales-by-channel": "sale_date",
  "daily-sales": "sale_day",
  "mobile-route-sales": "loading_date",
  "dispatch-trips": "scheduled_date",
  "trip-cash-settlement": "scheduled_date",
  "pod-compliance": "capture_date",
  "driver-deliveries": "delivery_date",
  "sales-pipeline": "order_date",
  "vat-collected": "sale_date",
  "category-sales": "sale_date",
  "discount-summary": "sale_date",
  "payment-collection": "payment_date",
  "credit-outstanding": "sale_date",
  "stock-movement": "created_at",
  "stock-transfers": "transfer_date",
  "branch-stock-transfers": "transfer_date",
  returns: "return_date",
  "purchases-by-supplier": "order_date",
  "open-lpo": "order_date",
  expenses: "expense_date",
  "journal-register": "entry_date",
  "general-ledger": "entry_date",
  "trial-balance": "entry_date",
  "balance-sheet": "entry_date",
  "profit-loss-gl": "entry_date",
  "cash-flow": "entry_date",
  "invoice-payments": "date_paid",
  "ar-aging": "invoice_date",
  "kra-receipts": "receipt_date",
  "till-sessions": "session_date",
  "audit-trail": "created_at",
  "statutory-deductions": "run_date",
  "bank-transfer": "run_date",
  "payroll-summary": "run_date",
  headcount: "hire_date",
  "contract-expiry": "contract_end_date",
  "stock-receipts": "receipt_date",
  damages: "damage_date",
};

/**
 * Extra query-string filters per report (API param name = id unless param set).
 * @type {Record<string, Array<{ id: string, param?: string, label: string, type: string, optionsKey?: string, placeholder?: string }>>}
 */
export const REPORT_EXTRA_FILTERS = {
  "sales-by-product": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "sub_category_id", label: "Subcategory", type: "select", optionsKey: "subcategories" },
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  "sales-by-supplier": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "q", label: "Search", type: "text", placeholder: "Supplier or product name…" },
  ],
  "sales-by-user": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "cashier_id", label: "User", type: "select", optionsKey: "cashiers" },
  ],
  "sales-by-channel": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "payment_status", label: "Payment", type: "select", optionsKey: "paymentStatuses" },
  ],
  "sales-by-customer": [
    { id: "route_name", label: "Route", type: "select", optionsKey: "routes" },
    { id: "q", label: "Search", type: "text", placeholder: "Customer name or phone…" },
  ],
  "daily-sales": [{ id: "channel", label: "Channel", type: "select", optionsKey: "channels" }],
  "category-sales": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "sub_category_id", label: "Subcategory", type: "select", optionsKey: "subcategories" },
  ],
  "vat-collected": [{ id: "channel", label: "Channel", type: "select", optionsKey: "channels" }],
  "discount-summary": [{ id: "channel", label: "Channel", type: "select", optionsKey: "channels" }],
  "payment-collection": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "method_code", label: "Payment method", type: "select", optionsKey: "paymentMethods" },
  ],
  "credit-outstanding": [
    { id: "payment_status", label: "Payment", type: "select", optionsKey: "paymentStatuses" },
  ],
  "top-debtors": [
    { id: "q", label: "Search", type: "text", placeholder: "Customer name, number, or phone…" },
  ],
  "invoice-payments": [
    { id: "q", label: "Search", type: "text", placeholder: "Customer, invoice #, or reference…" },
  ],
  "sales-pipeline": [
    { id: "channel", label: "Channel", type: "select", optionsKey: "channels" },
    { id: "status", label: "Order status", type: "select", optionsKey: "orderStatuses" },
    { id: "payment_status", label: "Payment", type: "select", optionsKey: "paymentStatuses" },
  ],
  "low-stock": [
    { id: "sub_category_id", label: "Subcategory", type: "select", optionsKey: "subcategories" },
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  "stock-movement": [
    { id: "transaction_type", label: "Type", type: "select", optionsKey: "transactionTypes" },
    { id: "stock_location", label: "Location", type: "select", optionsKey: "stockLocations" },
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  "stock-transfers": [
    { id: "from_location", label: "From", type: "select", optionsKey: "stockLocations" },
    { id: "to_location", label: "To", type: "select", optionsKey: "stockLocations" },
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  "stock-receipts": [
    { id: "product_code", label: "Product", type: "select", optionsKey: "products" },
    { id: "stock_location", label: "Location", type: "select", optionsKey: "stockLocations" },
  ],
  "stock-valuation": [
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  "stock-reservations": [
    { id: "stock_location", label: "Location", type: "select", optionsKey: "stockLocations" },
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  returns: [
    { id: "return_type", label: "Return type", type: "text", placeholder: "e.g. customer" },
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  damages: [
    { id: "product_code", label: "Product", type: "select", optionsKey: "products" },
  ],
  "branch-stock-transfers": [
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
  "stock-chain": [
    { id: "q", label: "Search", type: "text", placeholder: "Product name or code…" },
  ],
};

export function reportShowsDateRange(reportKey) {
  return !REPORTS_WITHOUT_DATE_FILTER.has(reportKey);
}

export function reportDefaultDateRangeDays(reportKey) {
  return REPORT_DEFAULT_DATE_RANGE_DAYS[reportKey] ?? 29;
}

export function reportDateColumn(reportKey) {
  return REPORT_DATE_COLUMNS[reportKey] ?? "sale_date";
}

export function reportSendsDateColumn(reportKey) {
  return reportShowsDateRange(reportKey) && !REPORTS_DATE_WITHOUT_COLUMN.has(reportKey);
}

export function reportHidesBranchFilter(reportKey) {
  return REPORTS_WITHOUT_BRANCH_FILTER.has(reportKey);
}

export function reportShowsTableFooter(reportKey) {
  return !REPORTS_WITHOUT_TABLE_FOOTER.has(reportKey);
}

/** @param {string} reportKey @param {Record<string, string>} values */
export function buildReportQueryParams(reportKey, { fromDate, toDate, branchId, extraValues = {} }) {
  /** @type {Record<string, string | number>} */
  const searchParams = {};

  if (reportShowsDateRange(reportKey)) {
    if (reportSendsDateColumn(reportKey)) {
      searchParams.date_column = reportDateColumn(reportKey);
    }
    if (fromDate) searchParams.from_date = fromDate;
    if (toDate) searchParams.to_date = toDate;
  }

  if (branchId && !reportHidesBranchFilter(reportKey)) {
    searchParams.branch_id = branchId;
  }

  for (const filter of REPORT_EXTRA_FILTERS[reportKey] ?? []) {
    const param = filter.param ?? filter.id;
    const value = extraValues[filter.id];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      searchParams[param] = value;
    }
  }

  return searchParams;
}
