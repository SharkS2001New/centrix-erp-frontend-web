import { sumField } from "@/lib/reports/format";

const VAT_KEYS = ["total_vat", "vat", "vat_collected", "product_vat"];
const GROSS_KEYS = [
  "gross_sales",
  "gross",
  "total_revenue",
  "order_total",
  "total_purchased",
  "collected",
  "taxable_sales",
];

function firstPresentKey(rows, keys) {
  if (!rows?.length) return null;
  const sample = rows[0];
  return keys.find((key) => key in sample && sample[key] != null) ?? null;
}

/** Summarize VAT totals when a report row set includes VAT and gross amount fields. */
export function summarizeReportVat(rows) {
  if (!rows?.length) return null;

  const vatKey = firstPresentKey(rows, VAT_KEYS);
  if (!vatKey) return null;

  const grossKey = firstPresentKey(rows, GROSS_KEYS);
  const vatTotal = sumField(rows, vatKey);
  const grossTotal = grossKey ? sumField(rows, grossKey) : null;
  const netExVat =
    grossTotal != null ? Math.max(0, grossTotal - vatTotal) : null;

  return {
    vatKey,
    grossKey,
    vatTotal,
    grossTotal,
    netExVat,
  };
}

export function reportVatKpis(rows, formatKes) {
  const summary = summarizeReportVat(rows);
  if (!summary) return [];

  const items = [];
  if (summary.grossTotal != null) {
    items.push({
      id: "gross-ex-vat",
      label: "Sales (ex VAT)",
      value: formatKes(summary.netExVat),
      hint: "Gross minus VAT on this page",
    });
    items.push({
      id: "vat",
      label: "VAT",
      value: formatKes(summary.vatTotal),
      hint: "Tax collected",
    });
    items.push({
      id: "gross-incl-vat",
      label: "Sales (incl VAT)",
      value: formatKes(summary.grossTotal),
      hint: "Gross including VAT",
    });
  } else {
    items.push({
      id: "vat",
      label: "VAT",
      value: formatKes(summary.vatTotal),
      hint: "Tax collected on this page",
    });
  }

  return items;
}
