import { apiRequest } from "@/lib/api";
import { enrichSaleLinesForQtyPrint, saleLineProductName, saleLineUom } from "@/lib/sale-line-items";
import {
  extractKraReceiptData,
  kraFailedWithoutVerificationLink,
} from "@/lib/kra-receipt-qr";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { mergeProcurementSettings } from "@/lib/procurement-settings";
import { mergeSalesSettings } from "@/lib/sales-settings";

function sectionFromResponse(res, key) {
  if (!res || typeof res !== "object") return null;
  return res[key] ?? res;
}

function saleHasKraVerificationLink(sale) {
  return Boolean(extractKraReceiptData(sale)?.signatureLink);
}

/** Tab-session cache — context-menu prints were hitting 4 settings endpoints every click. */
const PRINT_SETTINGS_TTL_MS = 90_000;
/** @type {{ at: number, value: Record<string, unknown> } | null} */
let printSettingsSessionCache = null;

export function clearPrintModuleSettingsCache() {
  printSettingsSessionCache = null;
}

/**
 * Load print-related module settings from the API so live prints match Admin → Printouts.
 * Falls back to cached capabilities when an individual request fails.
 * Includes finance so org KRA flags are never taken from a stale cross-org cache.
 */
export async function fetchPrintModuleSettings(fallback = null) {
  const merged =
    fallback && typeof fallback === "object" ? { ...fallback } : {};

  if (
    printSettingsSessionCache &&
    Date.now() - printSettingsSessionCache.at < PRINT_SETTINGS_TTL_MS
  ) {
    return { ...merged, ...printSettingsSessionCache.value };
  }

  const [salesResult, generalResult, procurementResult, financeResult] = await Promise.allSettled([
    apiRequest("/erp/settings/sales", { loading: false, reportIssues: false }),
    apiRequest("/erp/settings/general", { loading: false, reportIssues: false }),
    apiRequest("/erp/settings/procurement", { loading: false, reportIssues: false }),
    apiRequest("/erp/settings/finance", { loading: false, reportIssues: false }),
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
  if (financeResult.status === "fulfilled") {
    merged.finance = sectionFromResponse(financeResult.value, "finance");
  }

  printSettingsSessionCache = { at: Date.now(), value: { ...merged } };
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

/** Ensure sale line items (and eTIMS link when saved) are present before building print HTML. */
export async function ensureSaleForPrint(sale) {
  if (!sale?.id) return sale;

  const saleId = String(sale.id ?? "");
  // Local / pending-sync / previous-order draft reprints are already complete in memory —
  // never replace revised items with a GET of the pre-edit server sale.
  if (
    saleId.startsWith("offline:") ||
    saleId.startsWith("edit:") ||
    Boolean(sale.offline_pending_sync) ||
    Boolean(sale._skip_kra_qr)
  ) {
    return sale;
  }

  const items = Array.isArray(sale.items) ? sale.items : [];
  const missingProductNames =
    items.length > 0 &&
    items.some((line) => line?.product_code && !saleLineProductName(line));
  const missingPackaging =
    items.length > 0 &&
    items.some((line) => line?.product_code && !saleLineUom(line, null));
  // Only chase a saved eTIMS link when fiscalization actually ran and may still succeed.
  // KRA off (no kra_response) and failed/skipped must not delay print with extra fetches.
  const hasKraPayload = Boolean(sale.kra_response ?? sale.kraResponse);
  const needsKraRefresh =
    hasKraPayload &&
    !saleHasKraVerificationLink(sale) &&
    !kraFailedWithoutVerificationLink(sale);

  if (
    items.length > 0 &&
    !missingProductNames &&
    !missingPackaging &&
    !needsKraRefresh
  ) {
    return sale;
  }

  const endpoints = [`/sales/${sale.id}`];

  const existingKra = sale.kra_response ?? sale.kraResponse ?? null;
  const existingHasLink = saleHasKraVerificationLink(sale);
  const preserveRevisedItems =
    items.length > 0 && !missingProductNames && Boolean(sale._preserve_print_items);

  const preserveCheckoutSnapshot = (loaded) => {
    if (!loaded) return loaded;
    const posOrderNum =
      loaded.pos_order_num ??
      sale.pos_order_num ??
      sale.next_pos_order_num ??
      null;
    const posOrderDate =
      loaded.pos_order_date ?? sale.pos_order_date ?? sale.next_pos_order_date ?? null;
    return {
      ...loaded,
      // Keep caller line list when reprinting a local revision (swap/qty) before sync.
      ...(preserveRevisedItems ? { items } : {}),
      ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
      ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
      channel: loaded.channel ?? sale.channel,
      order_source: loaded.order_source ?? sale.order_source,
    };
  };

  for (const endpoint of endpoints) {
    try {
      const loaded = await apiRequest(endpoint, { loading: false, reportIssues: false });
      if (!loaded) continue;
      const merged = preserveCheckoutSnapshot(loaded);
      const loadedHasLink = saleHasKraVerificationLink(merged);

      // Prefer refreshed eTIMS payload when it has the verification link.
      if (loadedHasLink) {
        return merged;
      }

      // Preserve checkout KRA payload if the refreshed sale omitted / lost the link.
      if (existingHasLink && existingKra) {
        return { ...merged, kra_response: existingKra };
      }

      if (existingKra && !merged.kra_response && !merged.kraResponse) {
        return { ...merged, kra_response: existingKra };
      }
      return merged;
    } catch {
      // try next endpoint
    }
  }

  return sale;
}
