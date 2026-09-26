/** Open the floating AI assistant from elsewhere in the app (e.g. module search, Cmd+K, reports). */

/**
 * @typedef {{
 *   message?: string,
 *   autoSend?: boolean,
 *   pageContext?: Record<string, unknown> | null,
 *   fromVoice?: boolean,
 *   openPanel?: boolean,
 * }} AiAssistRequest
 */

/**
 * @typedef {{
 *   detailed?: boolean,
 *   needsPanel?: boolean,
 *   brief?: string,
 * }} AiVoiceCompletePayload
 */

/** @type {Set<(request: AiAssistRequest) => void>} */
const listeners = new Set();

/** @type {Set<(payload?: AiVoiceCompletePayload) => void>} */
const voiceCompleteListeners = new Set();

/** @param {(request: AiAssistRequest) => void} listener */
export function subscribeAiAssistRequests(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fired when a voice-asked reply has been handled (spoken or skipped). */
export function subscribeAiVoiceComplete(listener) {
  voiceCompleteListeners.add(listener);
  return () => voiceCompleteListeners.delete(listener);
}

/** @param {AiVoiceCompletePayload} [payload] */
export function notifyAiVoiceComplete(payload = {}) {
  voiceCompleteListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      /* ignore */
    }
  });
}

/** @param {AiAssistRequest} request */
export function requestAiAssist(request = {}) {
  const fromVoice = Boolean(request.fromVoice);
  const payload = {
    message: request.message?.trim() ?? "",
    autoSend: request.autoSend !== false,
    pageContext: request.pageContext ?? null,
    fromVoice,
    // Voice stays hands-free unless the caller forces the panel open.
    openPanel: request.openPanel !== undefined ? Boolean(request.openPanel) : !fromVoice,
  };
  listeners.forEach((listener) => listener(payload));
}

/** Open the assistant sidebar without sending a message. */
export function openAiAssistPanel(pageContext = null) {
  requestAiAssist({
    message: "",
    autoSend: false,
    openPanel: true,
    pageContext,
  });
}

/** True when the reply needs the sidebar (forms, confirms, long detail). */
export function isDetailedAssistantReply(res, content) {
  if (res?.form_spec?.fields?.length) return true;
  if (res?.pending_action) return true;
  if (res?.action_result) return true;
  if (Array.isArray(res?.document_links) && res.document_links.length > 0) return true;
  const text = String(content ?? res?.message ?? res?.reply ?? "");
  if (!text.trim()) return false;
  if (text.includes("|") && text.includes("\n")) return true;
  if ((text.match(/^\s*[-*]\s+/gm) || []).length >= 4) return true;
  if (text.length > 480) return true;
  return false;
}

/** True when the user must interact in the panel (confirm / fill form). */
export function assistantReplyNeedsPanel(res) {
  return Boolean(res?.form_spec?.fields?.length || res?.pending_action);
}

/** Build a lightweight page_context payload for chat. */
export function buildPageContext({
  screenKey,
  title,
  pathname,
  entity,
  entityId,
  branchId,
  filters,
  summary,
  rows,
  voiceMode,
} = {}) {
  const context = {
    screen_key: screenKey || undefined,
    title: title || undefined,
    pathname: pathname || undefined,
    entity: entity || undefined,
    entity_id: entityId != null ? String(entityId) : undefined,
    branch_id: branchId ?? undefined,
    filters: filters && typeof filters === "object" ? filters : undefined,
    summary: summary && typeof summary === "object" ? summary : undefined,
    rows: Array.isArray(rows) ? rows.slice(0, 40) : undefined,
    voice_mode: voiceMode ? true : undefined,
  };

  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}
