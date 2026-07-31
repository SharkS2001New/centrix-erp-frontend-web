import { isAiAssistantAvailable, canShowAiAssistant, isAiPlatformEnabled } from "@/lib/ai-settings";

export function canUseAiInsights({ capabilities, hasPermission }) {
  if (!canShowAiAssistant(hasPermission)) return false;
  if (!isAiPlatformEnabled(capabilities)) return false;
  if (!isAiAssistantAvailable(capabilities)) return false;
  const insights = capabilities?.ai_assistant?.insights;
  if (insights && insights.enabled === false) return false;
  return true;
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
