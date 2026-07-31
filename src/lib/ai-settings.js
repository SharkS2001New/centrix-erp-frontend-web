import { isPlatformAiEnabled } from "@/lib/platform-org-features";

/** @param {object} capabilities erp/capabilities payload */
export function isAiPlatformEnabled(capabilities) {
  return isPlatformAiEnabled(capabilities);
}

/** @param {object} capabilities erp/capabilities payload */
export function isAiAssistantAvailable(capabilities) {
  if (!isAiPlatformEnabled(capabilities)) return false;
  return Boolean(capabilities?.ai_assistant?.available);
}

/** @param {object} capabilities */
export function isAiAssistantEnabledForOrg(capabilities) {
  if (!isAiPlatformEnabled(capabilities)) return false;
  return Boolean(capabilities?.ai_assistant?.enabled);
}

/**
 * True when the signed-in user may open the floating ERP assistant.
 * Org AI settings control whether chat is fully configured; permission controls visibility.
 */
export function canShowAiAssistant(hasPermission) {
  if (typeof hasPermission !== "function") return false;
  return hasPermission("ai.assist.create") || hasPermission("ai.assist");
}

/** Search → Ask AI fallback when org AI is enabled and the user may use the assistant. */
export function canAskAiFromSearch({ capabilities, hasPermission }) {
  return (
    canShowAiAssistant(hasPermission) &&
    isAiPlatformEnabled(capabilities) &&
    isAiAssistantEnabledForOrg(capabilities)
  );
}

export function emailsListToText(list) {
  return Array.isArray(list) ? list.join(", ") : "";
}

export function textToList(text) {
  return String(text ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function defaultInsightsForm() {
  return {
    enabled: true,
    channels: { email: true, whatsapp: false, sms: false },
    recipients: { emailsText: "", phonesText: "", whatsappPhonesText: "" },
    stock_pulse: { enabled: false, schedule_time: "07:00", lookback_days: 14 },
    sales_brief: { enabled: false, schedule_time: "07:00", lookback_days: 7 },
    exception_alerts: { enabled: false, low_stock: true, unpaid_spike: false },
  };
}

export function insightsFormFromApi(insights) {
  const base = defaultInsightsForm();
  if (!insights || typeof insights !== "object") return base;
  return {
    enabled: insights.enabled !== false,
    channels: {
      email: insights.channels?.email !== false,
      whatsapp: Boolean(insights.channels?.whatsapp),
      sms: Boolean(insights.channels?.sms),
    },
    recipients: {
      emailsText: emailsListToText(insights.recipients?.emails),
      phonesText: emailsListToText(insights.recipients?.phones),
      whatsappPhonesText: emailsListToText(insights.recipients?.whatsapp_phones),
    },
    stock_pulse: {
      enabled: Boolean(insights.stock_pulse?.enabled),
      schedule_time: insights.stock_pulse?.schedule_time || "07:00",
      lookback_days: Number(insights.stock_pulse?.lookback_days ?? 14) || 14,
    },
    sales_brief: {
      enabled: Boolean(insights.sales_brief?.enabled),
      schedule_time: insights.sales_brief?.schedule_time || "07:00",
      lookback_days: Number(insights.sales_brief?.lookback_days ?? 7) || 7,
    },
    exception_alerts: {
      enabled: Boolean(insights.exception_alerts?.enabled),
      low_stock: insights.exception_alerts?.low_stock !== false,
      unpaid_spike: Boolean(insights.exception_alerts?.unpaid_spike),
    },
  };
}

export function insightsPayloadFromForm(insights) {
  if (!insights) return undefined;
  return {
    enabled: Boolean(insights.enabled),
    channels: {
      email: Boolean(insights.channels?.email),
      whatsapp: Boolean(insights.channels?.whatsapp),
      sms: Boolean(insights.channels?.sms),
    },
    recipients: {
      emails: textToList(insights.recipients?.emailsText),
      phones: textToList(insights.recipients?.phonesText),
      whatsapp_phones: textToList(insights.recipients?.whatsappPhonesText),
    },
    stock_pulse: {
      enabled: Boolean(insights.stock_pulse?.enabled),
      schedule_time: insights.stock_pulse?.schedule_time || "07:00",
      lookback_days: Math.min(90, Math.max(1, Number(insights.stock_pulse?.lookback_days) || 14)),
    },
    sales_brief: {
      enabled: Boolean(insights.sales_brief?.enabled),
      schedule_time: insights.sales_brief?.schedule_time || "07:00",
      lookback_days: Math.min(90, Math.max(1, Number(insights.sales_brief?.lookback_days) || 7)),
    },
    exception_alerts: {
      enabled: Boolean(insights.exception_alerts?.enabled),
      low_stock: Boolean(insights.exception_alerts?.low_stock),
      unpaid_spike: Boolean(insights.exception_alerts?.unpaid_spike),
    },
  };
}

export function aiFormFromApi(res) {
  const settings = res?.settings ?? res?.ai ?? {};
  return {
    enabled: Boolean(settings.enabled),
    provider: settings.provider ?? "openai",
    model: settings.model ?? "",
    api_key: "",
    base_url: settings.base_url ?? "",
    api_key_set: Boolean(settings.api_key_set),
    api_key_hint: settings.api_key_hint ?? "",
    available: Boolean(res?.available),
    platform_enabled: res?.platform_enabled !== false,
    insights: insightsFormFromApi(settings.insights),
  };
}

/**
 * @param {object} form
 * @param {{ includeInsights?: boolean }} [options]
 */
export function aiPayloadFromForm(form, options = {}) {
  const includeInsights = options.includeInsights !== false;
  const payload = {
    enabled: form.enabled,
    provider: form.provider,
    model: form.model || null,
    base_url: form.base_url || null,
  };
  if (form.api_key && !form.api_key.startsWith("••••")) {
    payload.api_key = form.api_key;
  }
  if (includeInsights && form.insights) {
    payload.insights = insightsPayloadFromForm(form.insights);
  }
  return payload;
}
