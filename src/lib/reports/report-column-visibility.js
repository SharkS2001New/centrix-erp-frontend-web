import { formatOrgDate } from "@/lib/format";

/** Org columns are implicit from the signed-in tenant. */
const HIDDEN_ORG_COLUMNS = new Set(["organization_id", "organization_name"]);

/** Branch id/name are redundant when the organization has a single branch. */
const HIDDEN_SINGLE_BRANCH_COLUMNS = new Set(["branch_id", "branch_name"]);

/** Product code is redundant in reports when product name is available (catalogue pages keep both). */
const HIDDEN_PRODUCT_CODE_COLUMN = "product_code";

/** Internal FK columns — kept in API for joins/UOM but not shown in report tables. */
const HIDDEN_INTERNAL_ID_COLUMNS = new Set(["unit_id"]);

/**
 * Bank transfer (payroll bank payment) receipt — drop IDs / period / status from the grid;
 * run date + pay period move to the document header when constant across rows.
 */
const BANK_TRANSFER_ALWAYS_HIDDEN = new Set([
  "payroll_run_id",
  "employee_id",
  "period_code",
  "period_start",
  "period_end",
  "run_date",
  "payroll_status",
]);

/** Same remittance-style layout as bank transfer (NSSF / other deductions by period). */
const PAYROLL_REMITTANCE_ALWAYS_HIDDEN = BANK_TRANSFER_ALWAYS_HIDDEN;

const PAYROLL_REMITTANCE_REPORT_KEYS = new Set([
  "bank-transfer",
  "nssf-remittance",
  "other-deductions",
]);

/** @param {object[]} rows @param {string} key */
export function isUniformReportColumn(rows, key) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const first = String(rows[0]?.[key] ?? "");
  return rows.every((row) => String(row?.[key] ?? "") === first);
}

/**
 * Header lines for remittance-style payroll reports when values are shared by every row.
 * @param {string} reportKey
 * @param {object[]} rows
 * @returns {string[]}
 */
export function reportConstantHeaderLines(reportKey, rows = []) {
  if (!PAYROLL_REMITTANCE_REPORT_KEYS.has(reportKey) || !rows.length) return [];

  const lines = [];
  if (isUniformReportColumn(rows, "run_date") && rows[0].run_date) {
    lines.push(`Run date: ${formatOrgDate(rows[0].run_date)}`);
  }
  if (
    isUniformReportColumn(rows, "period_start")
    && isUniformReportColumn(rows, "period_end")
    && (rows[0].period_start || rows[0].period_end)
  ) {
    const start = rows[0].period_start ? formatOrgDate(rows[0].period_start) : "—";
    const end = rows[0].period_end ? formatOrgDate(rows[0].period_end) : "—";
    lines.push(`Pay period: ${start} – ${end}`);
  }
  if (isUniformReportColumn(rows, "period_code") && rows[0].period_code) {
    lines.push(`Period: ${rows[0].period_code}`);
  }
  return lines;
}

/** Reservation / on-hand helper fields — live stock columns already show available qty. */
const HIDDEN_STOCK_HELPER_COLUMNS = new Set([
  "reserved_shop_quantity",
  "reserved_store_quantity",
  "available_shop_quantity",
  "available_store_quantity",
  "available_total_units",
  "current_shop_on_hand",
  "current_store_on_hand",
  "shop_on_hand",
  "store_on_hand",
  "last_cost_price",
  "retail_value",
  "shop_cost_value",
  "store_cost_value",
  "total_qty",
  "shop_qty",
  "store_qty",
  "unit_cost",
  "stock_value",
]);

/** UOM breakdown metadata — qty columns already show packaging via formatInventoryQtyWithUom. */
const HIDDEN_REPORT_UOM_DETAIL_COLUMNS = new Set([
  "uom_name",
  "sell_uom",
  "conversion_factor",
  "small_packaging_label",
  "middle_packaging_label",
  "middle_factor",
  "uom_type",
]);

/** Customer id/code columns — customer_name is sufficient in customer-facing reports. */
const HIDDEN_CUSTOMER_ID_COLUMNS = new Set(["customer_num", "customer_code"]);

/** Supplier id is redundant when supplier name is shown. */
const HIDDEN_SUPPLIER_ID_COLUMNS = new Set(["supplier_id"]);

/** Cashier id is redundant when salesperson name is shown. */
const HIDDEN_CASHIER_ID_COLUMNS = new Set(["cashier_id"]);

const REPORT_COLUMN_LABELS = {
  salesperson: "Salesperson",
  total_orders: "Total orders",
  total_items: "Total items",
  first_received_at: "First receive",
  first_adjustment_at: "First adjustment",
  first_entered_at: "First stock in",
  first_sold_at: "First sale",
  last_movement_at: "Last movement",
  total_received: "Received value (period)",
  total_sold: "Sold value (period)",
  current_shop_stock: "Shop available",
  current_store_stock: "Store available",
  shop_cost_value: "Shop stock value",
  store_cost_value: "Store stock value",
  total_cost_value: "Stock value",
  effective_unit_cost: "Unit cost",
  surname: "Surname",
  other_names: "Other names",
  id_number: "ID number",
  nssf_number: "NSSF number",
  income: "Income",
  member: "Member",
  employer: "Employer",
  total: "Total",
  deduction_name: "Deduction",
  calc_type: "Calc type",
  frequency: "Frequency",
  amount: "Amount",
};

/**
 * @param {string} key
 * @param {{
 *   multiBranch?: boolean,
 *   showProductCode?: boolean,
 *   rowKeys?: string[],
 *   reportKey?: string,
 *   rows?: object[],
 * }} [options]
 */
export function isRedundantReportColumn(
  key,
  {
    multiBranch = false,
    showProductCode = false,
    rowKeys = [],
    reportKey = "",
    rows = [],
  } = {},
) {
  if (HIDDEN_ORG_COLUMNS.has(key)) return true;
  if (HIDDEN_INTERNAL_ID_COLUMNS.has(key)) return true;
  if (HIDDEN_STOCK_HELPER_COLUMNS.has(key)) return true;
  if (HIDDEN_REPORT_UOM_DETAIL_COLUMNS.has(key)) return true;
  if (!multiBranch && HIDDEN_SINGLE_BRANCH_COLUMNS.has(key)) return true;
  if (reportKey === "bank-transfer") {
    if (BANK_TRANSFER_ALWAYS_HIDDEN.has(key)) return true;
    if (key === "payment_method" && isUniformReportColumn(rows, "payment_method")) {
      return true;
    }
  }
  if (reportKey === "nssf-remittance" || reportKey === "other-deductions") {
    if (PAYROLL_REMITTANCE_ALWAYS_HIDDEN.has(key)) return true;
    if (key === "employee_code" && reportKey === "nssf-remittance") return true;
    if (key === "source_type" || key === "deduction_scope") return true;
  }
  if (
    !showProductCode
    && key === HIDDEN_PRODUCT_CODE_COLUMN
    && rowKeys.includes("product_name")
  ) {
    return true;
  }
  if (
    HIDDEN_CUSTOMER_ID_COLUMNS.has(key)
    && rowKeys.includes("customer_name")
  ) {
    return true;
  }
  if (
    HIDDEN_SUPPLIER_ID_COLUMNS.has(key)
    && rowKeys.includes("supplier_name")
  ) {
    return true;
  }
  if (
    HIDDEN_CASHIER_ID_COLUMNS.has(key)
    && rowKeys.includes("salesperson")
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} key
 */
export function reportColumnLabel(key) {
  if (REPORT_COLUMN_LABELS[key]) return REPORT_COLUMN_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Hide product code from structured/custom report column defs when product name is present.
 * Hide branch name when the org has a single branch.
 *
 * @param {Array<{ key: string, label?: string }>} columns
 * @param {{ multiBranch?: boolean }} [options]
 */
export function filterStructuredReportColumns(columns = [], options = {}) {
  const { multiBranch = true } = options;
  const hasProductName = columns.some((col) => col.key === "product_name");
  const hasCustomerName = columns.some((col) => col.key === "customer_name");
  const hasSupplierName = columns.some((col) => col.key === "supplier_name");

  return columns
    .filter((col) => {
      if (hasProductName && col.key === HIDDEN_PRODUCT_CODE_COLUMN) return false;
      if (hasCustomerName && HIDDEN_CUSTOMER_ID_COLUMNS.has(col.key)) return false;
      if (hasSupplierName && HIDDEN_SUPPLIER_ID_COLUMNS.has(col.key)) return false;
      if (!multiBranch && HIDDEN_SINGLE_BRANCH_COLUMNS.has(col.key)) return false;
      return true;
    })
    .map((col) => {
      if (col.key === "product_name") {
        return {
          ...col,
          label: col.label === "Product Name" ? "Product" : (col.label ?? "Product"),
        };
      }
      if (col.key === "customer_name" && col.label === "Customer Name") {
        return { ...col, label: "Customer" };
      }
      return col;
    });
}

/**
 * @param {string[]} keys
 * @param {{ multiBranch?: boolean, showProductCode?: boolean, reportKey?: string, rows?: object[] }} [options]
 */
export function filterReportColumnKeys(keys, options = {}) {
  return keys.filter(
    (key) => !key.startsWith("_") && !isRedundantReportColumn(key, { ...options, rowKeys: keys }),
  );
}
