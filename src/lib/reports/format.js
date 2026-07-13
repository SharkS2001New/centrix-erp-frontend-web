import { formatOrgCurrency, formatOrgDate, formatOrgNumber } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import {
  formatReportQuantity,
  isInventoryQtyField,
  isLpoPackQtyField,
} from "@/lib/inventory-qty-display";
import {
  inventoryTransactionTypeLabel,
  salesChannelLabel,
} from "@/lib/user-facing-labels";
import { lpoRowDisplayNumber } from "@/lib/lpo-display";

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

const REPORT_COUNT_FIELD_KEYS = new Set([
  "orders",
  "order_count",
  "total_orders",
  "total_items",
  "open_invoices",
  "line_items",
  "expense_count",
  "payment_count",
  "products_sold",
  "transaction_count",
  "transactions",
  "incident_count",
  "transfer_count",
  "reservation_count",
]);

function isReportCountField(key) {
  if (!key) return false;
  if (REPORT_COUNT_FIELD_KEYS.has(key)) return true;
  if (/_(count|orders)$/i.test(key)) return true;
  return false;
}

function isReportCurrencyField(key) {
  if (!key || isReportCountField(key) || isInventoryQtyField(key) || isLpoPackQtyField(key)) {
    return false;
  }
  return /amount|total|paid|balance|vat|gross|net|price|cost|kes|value|float|variance|expected|actual|sales|revenue|profit|expense|debit|credit|collected|outstanding|due|purchased|invoiced/i.test(
    key,
  );
}

export function formatReportCell(key, value, settings = GENERAL_DEFAULTS, row = null) {
  if (value == null || value === "") return "—";
  if (key === "lpo_no") return lpoRowDisplayNumber(row ?? { lpo_no: value });
  if (key === "channel") return salesChannelLabel(value);
  if (key === "transaction_type") return inventoryTransactionTypeLabel(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (
    row &&
    (isInventoryQtyField(key) || isLpoPackQtyField(key)) &&
    (typeof value === "number" || isPlainNumericString(value))
  ) {
    return formatReportQuantity(value, row, key);
  }

  if (typeof value === "number") {
    if (isReportCurrencyField(key)) {
      return formatReportKes(value, settings);
    }
    if (isReportCountField(key) || /qty|quantity/i.test(key)) {
      return formatReportNumber(value, 0, settings);
    }
    return formatReportNumber(value, 2, settings);
  }
  if (typeof value === "string" && isPlainNumericString(value)) {
    if (row && (isInventoryQtyField(key) || isLpoPackQtyField(key))) {
      return formatReportQuantity(value, row, key);
    }
    const n = Number(value);
    if (isReportCurrencyField(key)) return formatReportKes(n, settings);
    if (isReportCountField(key) || /qty|quantity/i.test(key)) {
      return formatReportNumber(n, 0, settings);
    }
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatOrgDate(value, settings);
  }
  return String(value);
}

function isPlainNumericString(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "" || /^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false;
  return Number.isFinite(Number(trimmed));
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
