/** Platform-controlled sales behaviour flags exposed on erp/capabilities. */

import { isDistributionOpsEnabled } from "@/lib/distribution-settings";

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

export function isPlatformCheckoutOnCreateEnabled(capabilities) {
  return capabilities?.module_settings?.sales?.show_checkout_on_create_order !== false;
}

/**
 * Distribution orgs on Save order (no checkout on create) defer payment until fulfillment.
 * Orders may advance through processing while still unpaid on payment_status.
 * Queue screens still list by workflow status (Booked, Unpaid, Processed, …) so each
 * category only shows orders in that step — collect payment where the workflow allows it.
 * Does not apply when checkout on create is enabled (typical retail / wholesale POS).
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
