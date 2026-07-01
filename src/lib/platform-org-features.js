/** Platform-controlled sales behaviour flags exposed on erp/capabilities. */

export const ORDER_CANCELLABLE_STATUSES = new Set(["booked", "pending", "unpaid"]);

export function isPlatformCheckoutOnCreateEnabled(capabilities) {
  return capabilities?.module_settings?.sales?.show_checkout_on_create_order !== false;
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

export function isPlatformAdvancedDataImportEnabled(capabilities) {
  return capabilities?.platform_advanced_data_import_enabled === true;
}

export function isOrderExpiryNavEnabled(capabilities) {
  if (!capabilities?.modules?.distribution) return false;
  return capabilities?.module_settings?.sales?.order_expiry_enabled !== false;
}

export function isOrderCancellationEnabled(capabilities) {
  return capabilities?.module_settings?.sales?.order_cancellation_enabled !== false;
}

export function isOrderCancellationNavEnabled(capabilities) {
  if (!capabilities?.modules?.distribution) return false;
  return isOrderCancellationEnabled(capabilities);
}
