/** Platform-controlled sales behaviour flags exposed on erp/capabilities. */

import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import {
  resolveShowBackofficeCheckoutOnCreate,
  resolveShowPosCheckoutOnCreate,
} from "@/lib/sales-settings";

export const ORDER_CANCELLABLE_STATUSES = new Set([
  "booked",
  "pending",
  "unpaid",
  "processed",
  "pending_approval",
  "editable",
]);

export const ORDER_NON_CANCELLABLE_STATUSES = new Set([
  "paid",
  "delivered",
  "completed",
  "pending_payment",
]);

/** Backoffice Create order — checkout on create (not external POS). */
export function isPlatformCheckoutOnCreateEnabled(capabilities) {
  return resolveShowBackofficeCheckoutOnCreate(capabilities?.module_settings);
}

/** External POS (/pos) — checkout on create / complete sale. */
export function isPlatformPosCheckoutOnCreateEnabled(capabilities) {
  return resolveShowPosCheckoutOnCreate(capabilities?.module_settings);
}

/**
 * Distribution orgs on Save order (no checkout on create) defer payment until fulfillment.
 * Orders may advance through processing while still unpaid on payment_status.
 * Queue screens still list by workflow status (Booked, Unpaid, Processed, …) so each
 * category only shows orders in that step — except Unpaid / Partially paid pages, which
 * also include fulfillment stages with outstanding payment (Processed/Delivered + Unpaid).
 * Collect payment follows those payment stages: list pages + order detail.
 * Does not apply when backoffice checkout on create is enabled (typical retail / wholesale).
 */
export function orgDefersPaymentToFulfillment(capabilities) {
  if (!capabilities?.modules?.distribution) return false;
  if (!isDistributionOpsEnabled(capabilities)) return false;
  if (isPlatformCheckoutOnCreateEnabled(capabilities)) return false;
  return true;
}

export function isPlatformMobileOrdersEnabled(capabilities) {
  if (capabilities?.mobile_orders_enabled === false) return false;
  if (!capabilities?.modules?.["sales.mobile"]) return false;
  return capabilities?.module_settings?.sales?.enable_mobile_orders !== false;
}

export function isPlatformMpesaStkEnabled(capabilities) {
  return capabilities?.platform_mpesa_stk_enabled !== false;
}

export function isPlatformEquityBankEnabled(capabilities) {
  return capabilities?.platform_equity_bank_enabled !== false;
}

export function isPlatformKraIntegrationEnabled(capabilities) {
  return capabilities?.platform_kra_integration_enabled !== false;
}

export function isPlatformAiEnabled(capabilities) {
  if (capabilities?.platform_ai_enabled === false) return false;
  if (capabilities?.ai_assistant?.platform_enabled === false) return false;
  return true;
}

export function isPlatformWhatsappEnabled(capabilities) {
  return (
    capabilities?.platform_whatsapp_enabled === true ||
    capabilities?.whatsapp_orders?.platform_enabled === true
  );
}

export function isPlatformInvestorsEnabled(capabilities) {
  return (
    capabilities?.platform_investors_enabled === true ||
    capabilities?.modules?.investors === true ||
    capabilities?.module_settings?.investors?.enable_investors === true
  );
}

export function isCentrixPaymentsEnabled(capabilities) {
  return (
    capabilities?.platform_centrix_payments_enabled === true ||
    capabilities?.modules?.centrix_payments === true ||
    capabilities?.module_settings?.centrix_payments?.enable_centrix_payments === true
  );
}

/** M-Pesa keys, paybills, and Equity accounts inside the Centrix Payments application. */
export function canAccessCentrixPaymentsConfiguration({ user, capabilities, hasPermission }) {
  if (!isCentrixPaymentsEnabled(capabilities)) return false;
  if (user?.is_admin || capabilities?.is_admin) return true;
  if (typeof hasPermission !== "function") return false;
  return (
    hasPermission("centrix_payments.settings.view") ||
    hasPermission("centrix_payments.settings.edit") ||
    hasPermission("centrix_payments.mpesa.manage") ||
    hasPermission("centrix_payments.mpesa.view") ||
    hasPermission("centrix_payments.bank.manage") ||
    hasPermission("centrix_payments.bank.view") ||
    hasPermission("centrix_payments.accounts.edit")
  );
}

/** POS / checkout M-Pesa (manual + STK) when platform M-Pesa is enabled for the org. */
export function isPosMpesaPaymentsEnabled(capabilities) {
  return isPlatformMpesaStkEnabled(capabilities);
}

export function isPlatformAdvancedDataImportEnabled(capabilities) {
  return capabilities?.platform_advanced_data_import_enabled === true;
}

export function isPlatformTabWorkspaceEnabled(capabilities) {
  return capabilities?.platform_tab_workspace_enabled !== false;
}

export function isOrderExpiryNavEnabled(capabilities) {
  return capabilities?.module_settings?.sales?.order_expiry_enabled !== false;
}

export function isOrderCancellationEnabled(capabilities) {
  return capabilities?.module_settings?.sales?.order_cancellation_enabled !== false;
}

export function isOrderCancellationNavEnabled(capabilities) {
  return isOrderCancellationEnabled(capabilities);
}

export function isDiscountApprovalNavEnabled(capabilities) {
  const sales = capabilities?.module_settings?.sales ?? {};
  if (
    Object.prototype.hasOwnProperty.call(sales, "discount_approval_enabled_mobile") ||
    Object.prototype.hasOwnProperty.call(sales, "discount_approval_enabled_backoffice")
  ) {
    return Boolean(
      sales.discount_approval_enabled_mobile || sales.discount_approval_enabled_backoffice,
    );
  }
  return Boolean(sales.discount_approval_enabled);
}
