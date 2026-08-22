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

/** Reorder selected report columns (clamped). Returns a new array. */
export function moveReportBuilderColumn(columns, fromIndex, delta) {
  const list = Array.isArray(columns) ? [...columns] : [];
  if (list.length < 2) return list;
  const from = Number(fromIndex);
  if (!Number.isInteger(from) || from < 0 || from >= list.length) return list;
  const to = Math.max(0, Math.min(list.length - 1, from + Number(delta || 0)));
  if (to === from) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
}

/**
 * Prefer `spec.columns` order when choosing preview/export keys.
 * Matches backend aliases when possible, then falls back to remaining row keys.
 */
export function orderedReportBuilderPreviewKeys(specColumns, rowKeys = [], filterKeys = (keys) => keys) {
  const columns = Array.isArray(specColumns) ? specColumns : [];
  const preferred = columns.map((col) => {
    if (col?.alias) return String(col.alias);
    const field = String(col?.field ?? "");
    const source = String(col?.source ?? "");
    const aggregate = col?.aggregate ? String(col.aggregate) : "";
    if (aggregate) {
      return source ? `${source}_${field}_${aggregate}` : `${field}_${aggregate}`;
    }
    return source && columns.some((c) => c.source && c.source !== source)
      ? `${source}_${field}`
      : field;
  });

  const available = filterKeys(
    Array.isArray(rowKeys) && rowKeys.length
      ? rowKeys
      : preferred.filter(Boolean),
  );

  if (!available.length) return [];

  const used = new Set();
  const ordered = [];

  for (let i = 0; i < columns.length; i += 1) {
    const col = columns[i];
    const field = String(col?.field ?? "");
    const source = String(col?.source ?? "");
    const aggregate = col?.aggregate ? String(col.aggregate) : "";
    const candidates = [
      preferred[i],
      col?.alias,
      aggregate ? `${field}_${aggregate}` : null,
      aggregate && source ? `${source}_${field}_${aggregate}` : null,
      source ? `${source}_${field}` : null,
      field,
    ].filter(Boolean);

    let match = candidates.find((key) => available.includes(key) && !used.has(key));
    if (!match && field) {
      match = available.find(
        (key) =>
          !used.has(key) &&
          (key === field ||
            key.endsWith(`_${field}`) ||
            key.startsWith(`${field}_`) ||
            (source && key.startsWith(`${source}_${field}`))),
      );
    }
    if (match) {
      ordered.push(match);
      used.add(match);
    }
  }

  for (const key of available) {
    if (!used.has(key)) ordered.push(key);
  }

  return ordered;
}
