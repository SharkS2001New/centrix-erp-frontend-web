/** Org columns are implicit from the signed-in tenant. */
const HIDDEN_ORG_COLUMNS = new Set(["organization_id", "organization_name"]);

/** Branch id is redundant when the organization has a single branch. */
const HIDDEN_SINGLE_BRANCH_COLUMNS = new Set(["branch_id"]);

/** Product code is redundant in reports when product name is available (catalogue pages keep both). */
const HIDDEN_PRODUCT_CODE_COLUMN = "product_code";

/** Internal FK columns — kept in API for joins/UOM but not shown in report tables. */
const HIDDEN_INTERNAL_ID_COLUMNS = new Set(["unit_id"]);

const REPORT_COLUMN_LABELS = {
  product_name: "Product",
  first_received_at: "First receive",
  first_adjustment_at: "First adjustment",
  first_entered_at: "First stock in",
  first_sold_at: "First sale",
  last_movement_at: "Last movement",
  total_received: "Received (period)",
  total_sold: "Sold (period)",
  current_shop_stock: "Shop stock",
  current_store_stock: "Store stock",
};

/**
 * @param {string} key
 * @param {{ multiBranch?: boolean, showProductCode?: boolean, rowKeys?: string[] }} [options]
 */
export function isRedundantReportColumn(key, { multiBranch = false, showProductCode = false, rowKeys = [] } = {}) {
  if (HIDDEN_ORG_COLUMNS.has(key)) return true;
  if (HIDDEN_INTERNAL_ID_COLUMNS.has(key)) return true;
  if (!multiBranch && HIDDEN_SINGLE_BRANCH_COLUMNS.has(key)) return true;
  if (
    !showProductCode
    && key === HIDDEN_PRODUCT_CODE_COLUMN
    && rowKeys.includes("product_name")
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
 *
 * @param {Array<{ key: string, label?: string }>} columns
 */
export function filterStructuredReportColumns(columns = []) {
  const hasProductName = columns.some((col) => col.key === "product_name");
  if (!hasProductName) {
    return columns.map((col) =>
      col.key === "product_name" ? { ...col, label: col.label ?? "Product" } : col,
    );
  }

  return columns
    .filter((col) => col.key !== HIDDEN_PRODUCT_CODE_COLUMN)
    .map((col) =>
      col.key === "product_name"
        ? { ...col, label: col.label === "Product Name" ? "Product" : (col.label ?? "Product") }
        : col,
    );
}

/**
 * @param {string[]} keys
 * @param {{ multiBranch?: boolean, showProductCode?: boolean }} [options]
 */
export function filterReportColumnKeys(keys, options = {}) {
  return keys.filter(
    (key) => !key.startsWith("_") && !isRedundantReportColumn(key, { ...options, rowKeys: keys }),
  );
}
