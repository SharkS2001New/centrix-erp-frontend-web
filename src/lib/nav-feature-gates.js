import { isKraDeviceConfigured } from "@/lib/finance-settings";
import { isLegacyArchiveEnabled } from "@/lib/legacy-archive-settings";

/** Local copy to avoid importing sales-settings (circular via distribution-settings). */
function orgMobileSalesEnabledForNav(capabilities) {
  if (capabilities?.mobile_orders_enabled === false) return false;
  if (!capabilities?.modules?.["sales.mobile"]) return false;
  const sales = capabilities?.module_settings?.sales ?? capabilities?.module_settings ?? {};
  return Boolean(sales.enable_mobile_orders);
}

/** Report slugs that require the External POS application (`sales.pos`). */
export const POS_REPORT_KEYS = new Set([
  "eod-cashier",
  "eod-report",
  "till-sessions",
  "discount-summary",
  "payment-collection",
  "vat-collected",
]);

/** Report slugs that require the Distribution application. */
export const DISTRIBUTION_REPORT_KEYS = new Set([
  "mobile-route-sales",
  "dispatch-trips",
  "trip-cash-settlement",
  "pod-compliance",
  "driver-deliveries",
]);

export function isExternalPosEnabled(capabilities) {
  return Boolean(capabilities?.modules?.["sales.pos"]);
}

export function isDistributionModuleEnabled(capabilities) {
  return Boolean(capabilities?.modules?.distribution);
}

/** KRA sidebar links when platform allows integration and the org has configured a device. */
export function isKraNavEnabled(capabilities) {
  return isKraDeviceConfigured(capabilities?.module_settings, capabilities);
}

/**
 * Whether a catalog report should appear in sidebar / reports hub for this org.
 * @param {string} reportKey
 * @param {object | null | undefined} capabilities
 */
export function isReportNavEnabled(reportKey, capabilities) {
  if (!reportKey) return true;

  if (reportKey === "legacy-archive") {
    return isLegacyArchiveEnabled(capabilities);
  }

  if (reportKey === "kra-receipts") {
    return isKraNavEnabled(capabilities);
  }

  if (POS_REPORT_KEYS.has(reportKey)) {
    return isExternalPosEnabled(capabilities);
  }

  if (DISTRIBUTION_REPORT_KEYS.has(reportKey)) {
    return isDistributionModuleEnabled(capabilities);
  }

  if (reportKey === "mobile-route-sales" && !orgMobileSalesEnabledForNav(capabilities)) {
    return false;
  }

  return true;
}
