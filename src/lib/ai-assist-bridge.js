/** Open the floating AI assistant from elsewhere in the app (e.g. module search). */

/** @typedef {{ message?: string, autoSend?: boolean }} AiAssistRequest */

/** @type {Set<(request: AiAssistRequest) => void>} */
const listeners = new Set();

/** @param {(request: AiAssistRequest) => void} listener */
export function subscribeAiAssistRequests(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {AiAssistRequest} request */
export function requestAiAssist(request = {}) {
  const payload = {
    message: request.message?.trim() ?? "",
    autoSend: request.autoSend !== false,
  };
  listeners.forEach((listener) => listener(payload));
}
