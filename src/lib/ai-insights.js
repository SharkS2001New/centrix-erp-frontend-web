import {
  canShowAiAssistant,
  isAiAssistantAvailable,
  isAiAssistantEnabledForOrg,
  isAiPlatformEnabled,
} from "@/lib/ai-settings";

/** Insights not explicitly turned off in org AI settings. */
export function isAiInsightsSettingEnabled(capabilities) {
  const insights = capabilities?.ai_assistant?.insights;
  if (insights && insights.enabled === false) return false;
  return true;
}

/**
 * User may see AI Insights entry points (buttons / section).
 * Matches floating-assistant visibility + insights toggle — does not require API key yet.
 */
export function canShowAiInsights({ capabilities, hasPermission }) {
  if (!canShowAiAssistant(hasPermission)) return false;
  if (!isAiPlatformEnabled(capabilities)) return false;
  if (!isAiAssistantEnabledForOrg(capabilities)) return false;
  return isAiInsightsSettingEnabled(capabilities);
}

/**
 * User may call Insights APIs (analyze / stock pulse / deliver).
 * Requires a configured org OpenAI key (`ai_assistant.available`).
 */
export function canUseAiInsights({ capabilities, hasPermission }) {
  if (!canShowAiInsights({ capabilities, hasPermission })) return false;
  return isAiAssistantAvailable(capabilities);
}

export function aiInsightsBlockedReason({ capabilities, hasPermission }) {
  if (!canShowAiAssistant(hasPermission)) {
    return "Your role needs the Use AI assistant permission to open Insights.";
  }
  if (!isAiPlatformEnabled(capabilities)) {
    return "AI is turned off for this organization by the platform administrator.";
  }
  if (!isAiAssistantEnabledForOrg(capabilities)) {
    return "Enable the AI assistant under Settings → AI, then save.";
  }
  if (!isAiInsightsSettingEnabled(capabilities)) {
    return "Enable AI Insights under Settings → AI, then save.";
  }
  if (!isAiAssistantAvailable(capabilities)) {
    return "Add an OpenAI API key under Settings → AI and save so Insights can run.";
  }
  return null;
}

export function defaultInsightChannels(capabilities) {
  const channels = capabilities?.ai_assistant?.insights?.channels ?? {};
  return {
    email: channels.email !== false,
    whatsapp: Boolean(channels.whatsapp),
    sms: Boolean(channels.sms),
  };
}

/** Flatten findings + summary for clipboard. */
export function formatInsightClipboard(insight) {
  if (!insight) return "";
  const lines = [insight.summary || "", ""];
  for (const finding of insight.findings ?? []) {
    lines.push(`• ${finding}`);
  }
  return lines.join("\n").trim();
}

export { emailsListToText, textToList } from "@/lib/ai-settings";
