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
 *   interrupted?: boolean,
 * }} AiVoiceCompletePayload
 */

/**
 * @typedef {{
 *   brief?: string,
 * }} AiVoiceSpeakingPayload
 */

/** @type {Set<(request: AiAssistRequest) => void>} */
const listeners = new Set();

/** @type {Set<(payload?: AiVoiceCompletePayload) => void>} */
const voiceCompleteListeners = new Set();

/** @type {Set<(payload?: AiVoiceSpeakingPayload) => void>} */
const voiceSpeakingListeners = new Set();

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

/** Fired when CentrixAssistant starts speaking a Talk reply (barge-in can interrupt). */
export function subscribeAiVoiceSpeaking(listener) {
  voiceSpeakingListeners.add(listener);
  return () => voiceSpeakingListeners.delete(listener);
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

/** @param {AiVoiceSpeakingPayload} [payload] */
export function notifyAiVoiceSpeaking(payload = {}) {
  voiceSpeakingListeners.forEach((listener) => {
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

/** True when action_result is a deep-link navigate (ERP should open the path). */
export function isNavigateActionResult(res) {
  const result = res?.action_result?.result;
  if (!result || typeof result !== "object") return false;
  if (!result.navigate) return false;
  const href = String(result.path || result.href || "").trim();
  return href.startsWith("/");
}

/** Pending write that still needs fields collected in chat/Talk (not ready to confirm). */
function isCollectingPendingWrite(pending) {
  if (!pending || typeof pending !== "object") return false;
  const type = String(pending.type ?? "");
  if (!type) return false;
  const isWrite =
    type.startsWith("create_") ||
    type.startsWith("update_") ||
    type.startsWith("record_") ||
    type.startsWith("submit_") ||
    type.startsWith("approve_") ||
    type.startsWith("mark_") ||
    type.startsWith("receive_") ||
    type.startsWith("delete_");
  if (!isWrite) return false;
  return !pending.ready_to_confirm;
}

/** True when the reply needs the sidebar (forms, confirms, long detail). */
export function isDetailedAssistantReply(res, content) {
  if (res?.form_spec?.fields?.length) return true;
  // Mid-collect writes stay in Talk/chat — don't treat "Got supplier…" as a panel dump.
  if (res?.pending_action && !isCollectingPendingWrite(res.pending_action)) return true;
  // Pure navigation opens the route — don't force the Talk sidebar open.
  if (isNavigateActionResult(res)) return false;
  // Successful writes are summarized in Talk; don't treat every action_result as
  // "open the assistant" (that was forcing the panel on small replies).
  if (Array.isArray(res?.document_links) && res.document_links.length > 0) return true;
  const text = String(content ?? res?.message ?? res?.reply ?? "");
  if (!text.trim()) return false;
  if (text.includes("|") && text.includes("\n")) return true;
  if ((text.match(/^\s*[-*]\s+/gm) || []).length >= 4) return true;
  // Long prose alone should not yank the sidebar open during Talk.
  if (text.length > 900) return true;
  return false;
}

/** True when the user must interact in the panel (confirm / fill form). */
export function assistantReplyNeedsPanel(res) {
  if (res?.form_spec?.fields?.length) return true;
  const pending = res?.pending_action;
  if (!pending) return false;
  // Keep Talk hands-free while collecting supplier / lines — only open when ready to confirm.
  return Boolean(pending.ready_to_confirm);
}

/** Pending create/update that is easier to finish by typing than speaking. */
export function isWritePendingAction(pending) {
  const type = String(pending?.type ?? "");
  if (!type) return false;
  return (
    type.startsWith("create_") ||
    type.startsWith("update_") ||
    type === "record_customer_payment" ||
    type.startsWith("submit_") ||
    type.startsWith("approve_") ||
    type.startsWith("mark_") ||
    type.startsWith("receive_")
  );
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
