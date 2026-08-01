import { isPlatformAiEnabled } from "@/lib/platform-org-features";

/** Scheduled AI insight digests (mirrors backend AiInsightCatalog). */
export const AI_INSIGHT_DIGESTS = [
  { key: "stock_pulse", label: "Stock Pulse", lookback: 14, time: "07:00" },
  { key: "sales_brief", label: "Sales brief", lookback: 7, time: "07:00" },
  { key: "exception_radar", label: "Exception radar", lookback: 7, time: "07:05" },
  { key: "debtors_brief", label: "Credit / debtors brief", lookback: 30, time: "07:15" },
  { key: "cash_till_health", label: "Cash & till health", lookback: 14, time: "07:20" },
  { key: "margin_discount_watchdog", label: "Margin & discount watchdog", lookback: 14, time: "07:25" },
  { key: "collections_playbook", label: "Collections playbook", lookback: 60, time: "07:30" },
  { key: "anomaly_detection", label: "Anomaly detection", lookback: 7, time: "07:35" },
  { key: "forecast_light", label: "Demand forecast", lookback: 30, time: "07:40" },
  { key: "branch_till_benchmarks", label: "Branch / till benchmarks", lookback: 14, time: "07:45" },
  { key: "route_mobile_debrief", label: "Route / mobile debrief", lookback: 1, time: "18:00" },
];

export const AI_INSIGHT_ON_DEMAND = [
  { key: "product_demand", label: "Product demand" },
  { key: "customer_360", label: "Customer 360" },
  { key: "procurement_companion", label: "Procurement companion" },
  { key: "explain_screen", label: "Explain this screen" },
];

function defaultBrief(lookback = 7, time = "07:00") {
  return { enabled: false, schedule_time: time, lookback_days: lookback };
}

function defaultInsightsForm() {
  const digests = Object.fromEntries(
    AI_INSIGHT_DIGESTS.map((d) => [d.key, defaultBrief(d.lookback, d.time)]),
  );
  return {
    enabled: true,
    channels: { email: true, whatsapp: false, sms: false },
    recipients: { emailsText: "", phonesText: "", whatsappPhonesText: "" },
    ...digests,
    exception_alerts: {
      enabled: false,
      low_stock: true,
      unpaid_spike: true,
      unusual_discounts: true,
      void_cancel_bursts: true,
    },
  };
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

export function insightsFormFromApi(insights) {
  const base = defaultInsightsForm();
  if (!insights || typeof insights !== "object") return base;

  const digests = Object.fromEntries(
    AI_INSIGHT_DIGESTS.map((d) => {
      const row = insights[d.key] ?? {};
      return [
        d.key,
        {
          enabled: Boolean(row.enabled),
          schedule_time: row.schedule_time || d.time,
          lookback_days: Number(row.lookback_days ?? d.lookback) || d.lookback,
        },
      ];
    }),
  );

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
    ...digests,
    exception_alerts: {
      enabled: Boolean(insights.exception_alerts?.enabled),
      low_stock: insights.exception_alerts?.low_stock !== false,
      unpaid_spike: insights.exception_alerts?.unpaid_spike !== false,
      unusual_discounts: insights.exception_alerts?.unusual_discounts !== false,
      void_cancel_bursts: insights.exception_alerts?.void_cancel_bursts !== false,
    },
  };
}

export function insightsPayloadFromForm(insights) {
  if (!insights) return undefined;
  const digests = Object.fromEntries(
    AI_INSIGHT_DIGESTS.map((d) => {
      const row = insights[d.key] ?? defaultBrief(d.lookback, d.time);
      return [
        d.key,
        {
          enabled: Boolean(row.enabled),
          schedule_time: row.schedule_time || d.time,
          lookback_days: Math.min(90, Math.max(1, Number(row.lookback_days) || d.lookback)),
        },
      ];
    }),
  );

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
    ...digests,
    exception_alerts: {
      enabled: Boolean(insights.exception_alerts?.enabled),
      low_stock: Boolean(insights.exception_alerts?.low_stock),
      unpaid_spike: Boolean(insights.exception_alerts?.unpaid_spike),
      unusual_discounts: Boolean(insights.exception_alerts?.unusual_discounts),
      void_cancel_bursts: Boolean(insights.exception_alerts?.void_cancel_bursts),
    },
  };
}

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
    isPlatformAiEnabled(capabilities) &&
    isAiAssistantEnabledForOrg(capabilities)
  );
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
