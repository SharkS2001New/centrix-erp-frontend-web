import { isPlatformWhatsappEnabled } from "@/lib/platform-org-features";

/** @param {object} capabilities erp/capabilities payload */
export function isWhatsappPlatformEnabled(capabilities) {
  return isPlatformWhatsappEnabled(capabilities);
}

/** @param {object} capabilities */
export function isWhatsappOrdersEnabledForOrg(capabilities) {
  if (!isWhatsappPlatformEnabled(capabilities)) return false;
  return Boolean(capabilities?.whatsapp_orders?.enabled);
}

/** @param {object} capabilities */
export function isWhatsappOrdersConfigured(capabilities) {
  if (!isWhatsappPlatformEnabled(capabilities)) return false;
  return Boolean(capabilities?.whatsapp_orders?.configured);
}

export function whatsappFormFromApi(res) {
  const settings = res?.settings ?? {};
  return {
    enabled: Boolean(settings.enabled),
    display_phone: settings.display_phone ?? "",
    phone_number_id: settings.phone_number_id ?? "",
    waba_id: settings.waba_id ?? "",
    access_token: "",
    graph_api_version: settings.graph_api_version ?? "v21.0",
    branch_id: settings.branch_id != null ? String(settings.branch_id) : "",
    bot_user_id: settings.bot_user_id != null ? String(settings.bot_user_id) : "",
    access_token_set: Boolean(settings.access_token_set),
    access_token_hint: settings.access_token_hint ?? "",
    platform_enabled: res?.platform_enabled !== false,
    configured: Boolean(res?.configured),
    webhook_url: res?.webhook_url ?? "",
    bot_user: res?.bot_user ?? null,
  };
}

export function whatsappPayloadFromForm(form) {
  const payload = {
    enabled: form.enabled,
    display_phone: form.display_phone || null,
    phone_number_id: form.phone_number_id || null,
    waba_id: form.waba_id || null,
    graph_api_version: form.graph_api_version || null,
    branch_id: form.branch_id ? Number(form.branch_id) : null,
    bot_user_id: form.bot_user_id ? Number(form.bot_user_id) : null,
  };
  if (form.access_token && !form.access_token.startsWith("••••")) {
    payload.access_token = form.access_token;
  }
  return payload;
}

export function platformWhatsappFormFromApi(res) {
  return {
    webhook_url: res?.webhook_url ?? "",
    webhook_verify_token: "",
    webhook_verify_token_set: Boolean(res?.webhook_verify_token_set),
    webhook_verify_token_hint: res?.webhook_verify_token_hint ?? "",
    graph_api_version: res?.graph_api_version ?? "v21.0",
  };
}

export function platformWhatsappPayloadFromForm(form) {
  const payload = {
    graph_api_version: form.graph_api_version || null,
  };
  if (form.webhook_verify_token && !form.webhook_verify_token.startsWith("••••")) {
    payload.webhook_verify_token = form.webhook_verify_token;
  }
  return payload;
}
