import { apiRequest } from "@/lib/api";
import { saleLineProductName } from "@/lib/sale-line-items";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { mergeProcurementSettings } from "@/lib/procurement-settings";
import { mergeSalesSettings } from "@/lib/sales-settings";

function sectionFromResponse(res, key) {
  if (!res || typeof res !== "object") return null;
  return res[key] ?? res;
}

/**
 * Load print-related module settings from the API so live prints match Admin → Printouts.
 * Falls back to cached capabilities when an individual request fails.
 */
export async function fetchPrintModuleSettings(fallback = null) {
  const merged =
    fallback && typeof fallback === "object" ? { ...fallback } : {};

  const [salesResult, generalResult, procurementResult] = await Promise.allSettled([
    apiRequest("/erp/settings/sales", { loading: false, reportIssues: false }),
    apiRequest("/erp/settings/general", { loading: false, reportIssues: false }),
    apiRequest("/erp/settings/procurement", { loading: false, reportIssues: false }),
  ]);

  if (salesResult.status === "fulfilled") {
    merged.sales = sectionFromResponse(salesResult.value, "sales");
  }
  if (generalResult.status === "fulfilled") {
    merged.general = sectionFromResponse(generalResult.value, "general");
  }
  if (procurementResult.status === "fulfilled") {
    merged.procurement = sectionFromResponse(procurementResult.value, "procurement");
  }

  return merged;
}

export function resolvePrintGeneralSettings(moduleSettings) {
  return mergeGeneralSettings(moduleSettings);
}

export function resolvePrintSalesSettings(moduleSettings) {
  return mergeSalesSettings(moduleSettings);
}

export function resolvePrintProcurementSettings(moduleSettings) {
  return mergeProcurementSettings(moduleSettings);
}

/** Ensure sale line items are present (with product names) before building receipt/invoice HTML. */
export async function ensureSaleForPrint(sale) {
  if (!sale?.id) return sale;

  const items = Array.isArray(sale.items) ? sale.items : [];
  const missingProductNames =
    items.length > 0 &&
    items.some((line) => line?.product_code && !saleLineProductName(line));

  if (items.length > 0 && !missingProductNames) return sale;

  const isLegacy = Boolean(sale?.fulfillment_meta?.legacy_import);
  const endpoints = isLegacy
    ? [`/legacy-orders/${sale.id}?for_print=1`, `/legacy-orders/${sale.id}`, `/sales/${sale.id}`]
    : [`/sales/${sale.id}`, `/legacy-orders/${sale.id}?for_print=1`];

  for (const endpoint of endpoints) {
    try {
      const loaded = await apiRequest(endpoint, { loading: false, reportIssues: false });
      if (loaded) return loaded;
    } catch {
      // try next endpoint
    }
  }

  return sale;
}
