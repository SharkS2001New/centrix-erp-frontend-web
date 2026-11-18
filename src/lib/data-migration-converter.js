import { DATA_MIGRATION_FORMATS } from "@/lib/data-migration-formats";

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const NUMERIC_FIELDS = new Set([
  "unit_price",
  "last_cost_price",
  "discount_percentage",
  "discount_value",
  "product_weight",
  "stock_in_shop",
  "stock_in_store",
  "reorder_point",
  "customer_num",
  "route_id",
  "branch_id",
  "credit_limit",
  "latitude",
  "longitude",
  "middle_factor",
  "conversion_factor",
  "category_id",
  "unit_id",
  "subcategory_id",
]);
const BOOLEAN_FIELDS = new Set([
  "sell_on_retail",
  "sell_on_bar",
  "sell_on_hotel",
  "uses_small_packaging",
  "is_active",
]);

function normalizeNumericValue(value) {
  const source = String(value ?? "").trim();
  if (!source) return "";

  let numeric = source.replace(/[^\d,.\-+]/g, "");
  if (!numeric) return null;
  const comma = numeric.lastIndexOf(",");
  const dot = numeric.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    numeric = comma > dot
      ? numeric.replace(/\./g, "").replace(",", ".")
      : numeric.replace(/,/g, "");
  } else if (comma >= 0) {
    const commaCount = (numeric.match(/,/g) ?? []).length;
    const decimalComma = commaCount === 1 && numeric.length - comma - 1 !== 3;
    if (decimalComma) {
      numeric = numeric.replace(",", ".");
    } else {
      numeric = numeric.replace(/,/g, "");
    }
  }

  return Number.isFinite(Number(numeric)) ? numeric : null;
}

function chooseDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  if (tabs > 0) return "\t";
  return semicolons > commas ? ";" : ",";
}

function parseDelimitedRecords(text, delimiter) {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === "") {
      inQuotes = true;
    } else if (character === delimiter) {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("The pasted data has an unfinished quoted value.");
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push(record);
  return records;
}

/**
 * Parse CSV, semicolon-delimited text, or tab-delimited spreadsheet clipboard data.
 * The first non-empty row is treated as the source header.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseMigrationDelimitedText(text) {
  const source = String(text ?? "").replace(/^\ufeff/, "").trim();
  if (!source) return [];

  const records = parseDelimitedRecords(source, chooseDelimiter(source));
  if (records.length < 2) return [];

  const headerCounts = new Map();
  const headers = records[0].map((value, index) => {
    const label = value.trim() || `Column ${index + 1}`;
    const count = (headerCounts.get(label) ?? 0) + 1;
    headerCounts.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  });

  return records.slice(1).map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
  );
}

/**
 * Match source headings to Centrix import fields using each field's aliases.
 * @param {string[]} headers
 * @param {{ key: string, label: string, aliases?: string[], autoMap?: boolean }[]} columns
 * @returns {Record<string, string>}
 */
export function autoMapColumns(headers, columns) {
  const usedHeaders = new Set();
  const mapping = {};

  for (const column of columns) {
    if (column.autoMap === false) continue;
    const aliases = new Set(
      [column.key, column.label, ...(column.aliases ?? [])].map(normalizeHeader),
    );
    const sourceHeader = headers.find(
      (header) => !usedHeaders.has(header) && aliases.has(normalizeHeader(header)),
    );
    if (sourceHeader) {
      mapping[column.key] = sourceHeader;
      usedHeaders.add(sourceHeader);
    }
  }

  return mapping;
}

/**
 * Convert source rows to Centrix fields and mark rows that cannot be imported.
 * @param {Record<string, unknown>[]} rows
 * @param {string} formatKey
 * @param {Record<string, string>} mapping
 */
export function convertMigrationRows(rows, formatKey, mapping) {
  const format = DATA_MIGRATION_FORMATS[formatKey];
  if (!format) throw new Error(`Unknown migration format: ${formatKey}`);

  const { columns, type } = format;
  return rows.map((row, index) => {
    const values = Object.fromEntries(
      columns.map(({ key }) => [
        key,
        String(mapping[key] ? row[mapping[key]] ?? "" : "").trim(),
      ]),
    );
    const errors = [];

    if (type === "uoms") {
      values.measure_name ||= values.full_name;
      values.full_name ||= values.measure_name;
      values.uses_small_packaging ||= "true";
      values.small_packaging_label ||= "piece";
      values.conversion_factor ||= "1";
      values.uom_type ||= "piece";
      values.is_active ||= "true";
    } else if (type === "suppliers") {
      values.is_active ||= "true";
    } else if (type === "customers") {
      values.customer_type = values.customer_type.toLowerCase() === "route" ? "route" : "debtor";
    }

    for (const key of NUMERIC_FIELDS) {
      if (!values[key]) continue;
      const normalized = normalizeNumericValue(values[key]);
      if (normalized === null) {
        const label = columns.find((column) => column.key === key)?.label ?? key.replace(/_/g, " ");
        errors.push(`${label} must be numeric`);
      } else {
        values[key] = normalized;
      }
    }

    for (const key of BOOLEAN_FIELDS) {
      if (!values[key]) continue;
      const normalized = normalizeBooleanValue(values[key]);
      if (normalized === null) {
        const label = columns.find((column) => column.key === key)?.label ?? key.replace(/_/g, " ");
        errors.push(`${label} must be yes or no`);
      } else {
        values[key] = normalized;
      }
    }

    for (const key of format.requiredKeys ?? []) {
      if (!values[key]) {
        const label = columns.find((column) => column.key === key)?.label ?? key.replace(/_/g, " ");
        errors.push(`${label} required`);
      }
    }
    for (const alternativeKeys of format.requiredAlternatives ?? []) {
      if (alternativeKeys.some((key) => values[key] || Number(values[key]) > 0)) continue;
      const labels = alternativeKeys.map(
        (key) => columns.find((column) => column.key === key)?.label ?? key.replace(/_/g, " "),
      );
      errors.push(`${labels.join(" or ")} required`);
    }

    if (type === "customers") {
      const hasLatitude = Boolean(values.latitude);
      const hasLongitude = Boolean(values.longitude);
      if (hasLatitude !== hasLongitude) {
        errors.push("Latitude and longitude must be provided together");
      }
      if (values.customer_type === "route" && !values.route_name && !(Number(values.route_id) > 0)) {
        errors.push("Route name or ID required for a route customer");
      }
    }

    return { rowNumber: index + 2, values, errors };
  });
}

function normalizeBooleanValue(value) {
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "active", "enabled"].includes(normalized)) return "true";
  if (["false", "0", "no", "n", "inactive", "disabled"].includes(normalized)) return "false";
  return null;
}

/**
 * @param {Record<string, string>[]} rows
 * @param {{ key: string }[]} columns
 */
export function serializeImportCsv(rows, columns) {
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    columns.map(({ key }) => quote(key)).join(","),
    ...rows.map((row) => columns.map(({ key }) => quote(row[key])).join(",")),
  ].join("\r\n");
}
