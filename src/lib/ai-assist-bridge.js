/** Open the floating AI assistant from elsewhere in the app (e.g. module search, Cmd+K, reports). */

/**
 * @typedef {{
 *   message?: string,
 *   autoSend?: boolean,
 *   pageContext?: Record<string, unknown> | null,
 *   fromVoice?: boolean,
 * }} AiAssistRequest
 */

/** @type {Set<(request: AiAssistRequest) => void>} */
const listeners = new Set();

/** @type {Set<() => void>} */
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

export function notifyAiVoiceComplete() {
  voiceCompleteListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

/** @param {AiAssistRequest} request */
export function requestAiAssist(request = {}) {
  const payload = {
    message: request.message?.trim() ?? "",
    autoSend: request.autoSend !== false,
    pageContext: request.pageContext ?? null,
    fromVoice: Boolean(request.fromVoice),
  };
  listeners.forEach((listener) => listener(payload));
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
