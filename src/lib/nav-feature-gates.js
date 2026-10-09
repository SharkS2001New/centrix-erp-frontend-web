import { isBackofficeSectionEnabled, usesTillFloat } from "@/lib/backoffice-sections";
import { isKraDeviceConfigured } from "@/lib/finance-settings";

/** Report slugs that disappear when their Backoffice section is off for the organisation. */
const REPORT_BACKOFFICE_SECTION = {
  "daily-sales": "sales_orders",
  "sales-by-product": "sales_orders",
  "sales-by-user": "sales_orders",
  "sales-by-channel": "sales_orders",
  "sales-pipeline": "sales_orders",
  "category-sales": "products",
  "price-list": "products",
  "sales-by-customer": "customers",
  "credit-outstanding": "customers",
  "customer-statement": "customers",
  "sales-by-supplier": "suppliers",
  "open-lpo": "suppliers",
  "purchases-by-supplier": "suppliers",
  "supplier-returns": "suppliers",
  "stock-on-hand": "inventory",
  "low-stock": "inventory",
  "stock-movement": "inventory",
  "stock-chain": "inventory",
  "stock-valuation": "inventory",
  "stock-reservations": "inventory",
  "stock-transfers": "stock_movements",
  "branch-stock-transfers": "stock_movements",
  "stock-receipts": "stock_movements",
  damages: "stock_movements",
  returns: "after_sales",
  "eod-cashier": "pos",
  "eod-report": "pos",
  "till-sessions": "pos",
  "discount-summary": "pos",
  "payment-collection": "pos",
  "vat-collected": "pos",
};

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

/** Direct-checkout credit customer field (External POS / till checkout). */
export function isDirectCheckoutCreditEnabled(capabilities) {
  if (!capabilities?.modules?.customers_suppliers) return false;
  const sales = capabilities?.module_settings?.sales ?? {};
  return Boolean(sales.enable_credit_payment);
}

/**
 * Shop Debtors nav/page: credit customers for till / direct checkout.
 * Hidden for distribution-only orgs that have neither External POS nor
 * direct-checkout credit payment.
 */
export function shouldShowShopDebtors(capabilities) {
  if (isExternalPosEnabled(capabilities) || isDirectCheckoutCreditEnabled(capabilities)) {
    return true;
  }
  // Non-distribution orgs can still manage debtor customer records.
  return (
    Boolean(capabilities?.modules?.customers_suppliers) &&
    !isDistributionModuleEnabled(capabilities)
  );
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

  if (reportKey === "till-sessions" && usesTillFloat(capabilities)) {
    return isBackofficeSectionEnabled(capabilities, "pos");
  }

  const section = REPORT_BACKOFFICE_SECTION[reportKey];
  if (section && !isBackofficeSectionEnabled(capabilities, section)) {
    return false;
  }

  if (reportKey === "kra-receipts" || reportKey === "kra-invoices" || reportKey === "kra-compliance-summary" || reportKey === "kra-unfiscalized-sales") {
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
