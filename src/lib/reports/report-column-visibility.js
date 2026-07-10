/** Org columns are implicit from the signed-in tenant. */
const HIDDEN_ORG_COLUMNS = new Set(["organization_id", "organization_name"]);

/** Branch id is redundant when the organization has a single branch. */
const HIDDEN_SINGLE_BRANCH_COLUMNS = new Set(["branch_id"]);

/** Product code is redundant in reports when product name is available (catalogue pages keep both). */
const HIDDEN_PRODUCT_CODE_COLUMN = "product_code";

/** Internal FK columns — kept in API for joins/UOM but not shown in report tables. */
const HIDDEN_INTERNAL_ID_COLUMNS = new Set(["unit_id"]);

/** UOM breakdown metadata — qty columns already show packaging via formatInventoryQtyWithUom. */
const HIDDEN_REPORT_UOM_DETAIL_COLUMNS = new Set([
  "uom_name",
  "conversion_factor",
  "small_packaging_label",
  "middle_packaging_label",
  "middle_factor",
  "uom_type",
]);

/** Customer id/code columns — customer_name is sufficient in customer-facing reports. */
const HIDDEN_CUSTOMER_ID_COLUMNS = new Set(["customer_num", "customer_code"]);

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
  if (HIDDEN_REPORT_UOM_DETAIL_COLUMNS.has(key)) return true;
  if (!multiBranch && HIDDEN_SINGLE_BRANCH_COLUMNS.has(key)) return true;
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
  const hasCustomerName = columns.some((col) => col.key === "customer_name");

  return columns
    .filter((col) => {
      if (hasProductName && col.key === HIDDEN_PRODUCT_CODE_COLUMN) return false;
      if (hasCustomerName && HIDDEN_CUSTOMER_ID_COLUMNS.has(col.key)) return false;
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
 * @param {{ multiBranch?: boolean, showProductCode?: boolean }} [options]
 */
export function filterReportColumnKeys(keys, options = {}) {
  return keys.filter(
    (key) => !key.startsWith("_") && !isRedundantReportColumn(key, { ...options, rowKeys: keys }),
  );
}
