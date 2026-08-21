/**
 * Report Builder column helpers — prefer master-source fields and simplify the picker.
 */

/** Canonical field → preferred master source when that source is selected. */
export const REPORT_BUILDER_MASTER_FIELDS = {
  product_name: "products",
  product_code: "products",
  category_name: "products",
  customer_name: "customers",
  customer_num: "customers",
  customer_phone: "customers",
  branch_name: "branches",
  branch_code: "branches",
  supplier_name: "suppliers",
  supplier_code: "suppliers",
  supplier_town: "suppliers",
};

/**
 * Fields that belong on a source even when a master exists (transactional facts).
 * Everything else matching a master key is hidden when the master source is selected.
 */
const ALLOWED_ON_NON_MASTER = new Set([
  // Keep transactional identifiers that are part of the row grain.
  "sale_id",
  "order_num",
  "invoice_number",
  "qty",
  "quantity",
  "unit_price",
  "line_total",
  "amount",
  "order_total",
]);

export function reportBuilderVisibleFields(sourceSchema, selectedSources = []) {
  const fields = sourceSchema?.fields ?? [];
  const sourceKey = sourceSchema?.key;
  const selected = new Set(selectedSources);
  const hasProductName = fields.some((field) => field.key === "product_name");

  return fields.filter((field) => {
    if (hasProductName && field.key === "product_code") return false;

    const masterSource = REPORT_BUILDER_MASTER_FIELDS[field.key];
    if (!masterSource) return true;
    if (sourceKey === masterSource) return true;
    if (ALLOWED_ON_NON_MASTER.has(field.key)) return true;

    // Prefer the master source when it is part of this report.
    if (selected.has(masterSource) && sourceKey !== masterSource) {
      return false;
    }

    return true;
  });
}

/** Flat searchable column list for selected sources (deduped by master preference). */
export function reportBuilderColumnCatalog(schema, selectedSources) {
  const rows = [];
  for (const sourceKey of selectedSources) {
    const sourceSchema = schema?.sources?.find((s) => s.key === sourceKey);
    if (!sourceSchema) continue;
    for (const field of reportBuilderVisibleFields(sourceSchema, selectedSources)) {
      rows.push({
        sourceKey,
        sourceLabel: sourceSchema.label,
        field,
        searchText: `${sourceSchema.label} ${field.label} ${field.key} ${field.type}`.toLowerCase(),
      });
    }
  }
  return rows;
}
