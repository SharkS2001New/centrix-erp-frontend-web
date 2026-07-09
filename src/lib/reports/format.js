import { formatOrgCurrency, formatOrgDate, formatOrgNumber } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import {
  formatInventoryQtyWithUom,
  isInventoryQtyField,
} from "@/lib/inventory-qty-display";

export function formatReportKes(value, settings = GENERAL_DEFAULTS) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return formatOrgCurrency(n, settings);
}

export function formatReportNumber(value, decimals = 2, settings = GENERAL_DEFAULTS) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return formatOrgNumber(n, settings, { decimals });
}

export function formatReportCell(key, value, settings = GENERAL_DEFAULTS, row = null) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (isInventoryQtyField(key)) {
      return row ? formatInventoryQtyWithUom(value, row) : formatReportNumber(value, 0, settings);
    }
    if (/amount|total|paid|balance|vat|gross|net|price|cost|kes|value|float|variance|expected|actual|sales|revenue|profit|expense|debit|credit|collected|outstanding|due/i.test(key)) {
      return formatReportKes(value, settings);
    }
    if (/qty|quantity|count|orders|transactions/i.test(key)) {
      return formatReportNumber(value, 0, settings);
    }
    return formatReportNumber(value, 2, settings);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatOrgDate(value, settings);
  }
  return String(value);
}

export function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
}

export function exportRowsToCsv(filename, columns, rows) {
  const header = columns.map((c) => c.label).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const raw = col.accessor(row);
          const text = raw == null ? "" : String(raw).replace(/"/g, '""');
          return `"${text}"`;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
