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

function firstPresentSummaryKey(summary, keys) {
  if (!summary || typeof summary !== "object") return null;
  return keys.find((key) => summary[key] != null && summary[key] !== "") ?? null;
}

/** Summarize VAT totals when a report row set includes VAT and gross amount fields. */
export function summarizeReportVat(rows, apiSummary = null) {
  const vatKey =
    firstPresentSummaryKey(apiSummary, VAT_KEYS) ?? firstPresentKey(rows, VAT_KEYS);
  if (!vatKey) return null;

  const grossKey =
    firstPresentSummaryKey(apiSummary, GROSS_KEYS) ?? firstPresentKey(rows, GROSS_KEYS);

  const vatTotal =
    apiSummary?.[vatKey] != null ? Number(apiSummary[vatKey]) || 0 : sumField(rows, vatKey);
  const grossTotal =
    grossKey == null
      ? null
      : apiSummary?.[grossKey] != null
        ? Number(apiSummary[grossKey]) || 0
        : sumField(rows, grossKey);
  const netExVat =
    apiSummary?.net_ex_vat != null
      ? Number(apiSummary.net_ex_vat) || 0
      : apiSummary?.net_sales != null
        ? Number(apiSummary.net_sales) || 0
        : apiSummary?.net != null
          ? Number(apiSummary.net) || 0
          : grossTotal != null
            ? Math.max(0, grossTotal - vatTotal)
            : null;

  return {
    vatKey,
    grossKey,
    vatTotal,
    grossTotal,
    netExVat,
  };
}

export function reportVatKpis(rows, formatKes, apiSummary = null) {
  const summary = summarizeReportVat(rows, apiSummary);
  if (!summary) return [];

  const items = [];
  if (summary.grossTotal != null) {
    items.push({
      id: "gross-ex-vat",
      label: "Sales (ex VAT)",
      value: formatKes(summary.netExVat),
      hint: "Gross minus VAT",
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
      hint: "Tax collected",
    });
  }

  return items;
}
