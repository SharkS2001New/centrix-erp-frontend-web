import { formatShortDate } from "@/components/catalog/catalog-shared";

export function formatReportKes(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatReportNumber(value, decimals = 2) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatReportCell(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (/amount|total|paid|balance|vat|gross|net|price|cost|kes|value|float|variance|expected|actual|sales|revenue|profit|expense|debit|credit|collected|outstanding|due/i.test(key)) {
      return formatReportKes(value);
    }
    if (/qty|quantity|count|orders|transactions/i.test(key)) {
      return formatReportNumber(value, 0);
    }
    return formatReportNumber(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatShortDate(value);
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
