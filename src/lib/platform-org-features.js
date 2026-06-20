/** Platform-controlled sales behaviour flags exposed on erp/capabilities. */

export function isPlatformCheckoutOnCreateEnabled(capabilities) {
  return capabilities?.module_settings?.sales?.show_checkout_on_create_order !== false;
}

export function isPlatformMobileOrdersEnabled(capabilities) {
  if (capabilities?.mobile_orders_enabled === false) return false;
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
