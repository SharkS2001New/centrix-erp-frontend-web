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
  { key: "explain_screen", label: "Analyze this page with AI" },
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

/**
 * Header “Talk to Centrix Assistant”.
 * A platform administrator must enable Talk for this organisation, and the organisation must leave it on.
 */
export function canUseAiTalk({ capabilities, hasPermission }) {
  if (!canShowAiAssistant(hasPermission)) return false;
  return capabilities?.ai_assistant?.talk_enabled === true
    && capabilities?.ai_assistant?.platform_talk_enabled !== false;
}

/** Platform Talk voice presets (ERP web + Manager pick closest on-device voice). */
export const TALK_VOICE_OPTIONS = [
  { id: "en-GB-female", locale: "en-GB", gender: "female", label: "British English · Female" },
  { id: "en-GB-male", locale: "en-GB", gender: "male", label: "British English · Male" },
  { id: "en-US-female", locale: "en-US", gender: "female", label: "American English · Female" },
  { id: "en-US-male", locale: "en-US", gender: "male", label: "American English · Male" },
];

export function normalizeTalkVoice(raw) {
  const fallback = TALK_VOICE_OPTIONS[0];
  if (!raw) return { ...fallback };
  if (typeof raw === "object") {
    const id = String(raw.id || "").trim();
    const hit = TALK_VOICE_OPTIONS.find((o) => o.id === id);
    if (hit) return { ...hit };
    const locale = String(raw.locale || "en-GB").replace(/_/g, "-");
    const gender = String(raw.gender || "female").toLowerCase();
    const byParts = TALK_VOICE_OPTIONS.find(
      (o) => o.locale.toLowerCase() === locale.toLowerCase() && o.gender === gender,
    );
    return byParts ? { ...byParts } : { ...fallback };
  }
  const id = String(raw).trim().replace(/_/g, "-");
  const hit = TALK_VOICE_OPTIONS.find((o) => o.id.toLowerCase() === id.toLowerCase());
  return hit ? { ...hit } : { ...fallback };
}

export function talkVoiceFromCapabilities(capabilities) {
  return normalizeTalkVoice(capabilities?.ai_assistant?.talk_voice);
}

export function aiFormFromApi(res) {
  const settings = res?.settings ?? res?.ai ?? {};
  const platformOffersFree = Boolean(
    res?.platform_offers_free_ai ?? res?.use_platform_gemini ?? settings.use_platform_gemini,
  );
  const hasOrgKey = Boolean(res?.has_org_api_key ?? settings.api_key_set);
  const usePlatformAi = Boolean(
    res?.use_platform_ai ??
      settings.use_platform_ai ??
      (platformOffersFree && !hasOrgKey),
  );
  const talkVoice = normalizeTalkVoice(settings.talk_voice ?? res?.talk_voice);

  return {
    enabled: Boolean(settings.enabled),
    talk_enabled: settings.talk_enabled === true,
    talk_voice: talkVoice.id,
    talk_provider: settings.talk_provider === "openai" ? "openai" : "gemini",
    talk_api_key: "",
    talk_model: settings.talk_model ?? "",
    talk_base_url: settings.talk_base_url ?? "",
    talk_api_key_set: Boolean(settings.talk_api_key_set),
    talk_api_key_hint: settings.talk_api_key_hint ?? "",
    talk_gemini_api_key: "",
    talk_gemini_model: settings.talk_gemini_model ?? "",
    talk_gemini_api_key_set: Boolean(settings.talk_gemini_api_key_set),
    talk_gemini_api_key_hint: settings.talk_gemini_api_key_hint ?? "",
    use_platform_ai: usePlatformAi,
    provider: settings.provider ?? res?.free_ai_provider ?? "openai",
    model: settings.model ?? "",
    api_key: "",
    base_url: settings.base_url ?? "",
    api_key_set: Boolean(settings.api_key_set),
    api_key_hint: settings.api_key_hint ?? "",
    gemini_api_key: "",
    gemini_model: settings.gemini_model ?? res?.gemini_model ?? "",
    gemini_api_key_set: Boolean(settings.gemini_api_key_set),
    gemini_api_key_hint: settings.gemini_api_key_hint ?? "",
    free_ai_provider: settings.free_ai_provider ?? res?.free_ai_provider ?? "gemini",
    use_platform_gemini: platformOffersFree,
    platform_offers_free_ai: platformOffersFree,
    platform_gemini_configured: Boolean(res?.platform_gemini_configured ?? res?.gemini_available),
    platform_free_ai_configured: Boolean(
      res?.platform_free_ai_configured ?? res?.free_ai_configured ?? res?.platform_gemini_configured,
    ),
    has_org_api_key: hasOrgKey,
    credential_source: res?.credential_source ?? null,
    available: Boolean(res?.available),
    platform_enabled: res?.platform_chat_enabled === true || res?.platform_enabled === true,
    platform_chat_enabled: res?.platform_chat_enabled === true || res?.platform_enabled === true,
    platform_talk_enabled: res?.platform_talk_enabled === true,
    insights: insightsFormFromApi(settings.insights),
  };
}

/** Org admin payload. Chat and Talk stay inside the platform administrator’s switches. */
export function aiOrgPayloadFromForm(form) {
  const payload = {
    enabled: Boolean(form.enabled),
    talk_enabled: Boolean(form.talk_enabled),
    use_platform_ai: Boolean(form.use_platform_ai),
    provider: form.provider,
    model: form.model || null,
    base_url: form.base_url || null,
    insights: insightsPayloadFromForm(form.insights),
  };
  if (form.api_key && !form.api_key.startsWith("••••")) {
    payload.api_key = form.api_key;
  }
  return payload;
}

/**
 * @param {object} form
 * @param {{ includeInsights?: boolean, includePlatformGemini?: boolean }} [options]
 */
export function aiPayloadFromForm(form, options = {}) {
  const includeInsights = options.includeInsights !== false;
  const includePlatformGemini = Boolean(options.includePlatformGemini);
  const payload = {
    enabled: form.enabled,
    provider: form.provider,
    model: form.model || null,
    base_url: form.base_url || null,
  };
  if (form.api_key && !form.api_key.startsWith("••••")) {
    payload.api_key = form.api_key;
  }
  if (includePlatformGemini) {
    if (form.gemini_api_key && !form.gemini_api_key.startsWith("••••")) {
      payload.gemini_api_key = form.gemini_api_key;
    }
    payload.gemini_model = form.gemini_model || null;
    if (["openai", "gemini"].includes(form.free_ai_provider)) {
      payload.free_ai_provider = form.free_ai_provider;
    }
    payload.talk_enabled = form.talk_enabled !== false;
    if (["openai", "gemini"].includes(form.talk_provider)) {
      payload.talk_provider = form.talk_provider;
    }
    if (form.talk_voice) {
      payload.talk_voice = normalizeTalkVoice(form.talk_voice).id;
    }
    if (form.talk_api_key && !form.talk_api_key.startsWith("••••")) {
      payload.talk_api_key = form.talk_api_key;
    }
    payload.talk_model = form.talk_model || null;
    payload.talk_base_url = form.talk_base_url || null;
    if (form.talk_gemini_api_key && !form.talk_gemini_api_key.startsWith("••••")) {
      payload.talk_gemini_api_key = form.talk_gemini_api_key;
    }
    payload.talk_gemini_model = form.talk_gemini_model || null;
  }
  if (includeInsights && form.insights) {
    payload.insights = insightsPayloadFromForm(form.insights);
  }
  return payload;
}
