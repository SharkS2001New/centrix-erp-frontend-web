/** Event bus for user-facing system error prompts (consumed by SystemIssueProvider). */

/** @typedef {{ type: 'error', message: string, reportId?: string | null, pageUrl?: string, apiPath?: string, httpMethod?: string, httpStatus?: number | null, durationMs?: number | null, canReport?: boolean }} SystemIssueEvent */

/** @type {Set<(event: SystemIssueEvent) => void>} */
const listeners = new Set();

/** @param {(event: SystemIssueEvent) => void} listener */
export function subscribeSystemIssues(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {SystemIssueEvent} event */
export function emitSystemIssue(event) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* ignore listener errors */
    }
  });
}
