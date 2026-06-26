/** Module-level loading counter for global preloader (no React dependency). */

let pendingCount = 0;
let activeLabel = "Loading…";
/** True briefly after route changes — only GETs during this window show the global overlay. */
let pageNavigationActive = false;
/** @type {Set<(state: { pending: number, label: string }) => void>} */
const listeners = new Set();

function emit() {
  const state = { pending: pendingCount, label: activeLabel };
  listeners.forEach((listener) => listener(state));
}

/** @param {(state: { pending: number, label: string }) => void} listener */
export function subscribeAppLoading(listener) {
  listeners.add(listener);
  listener({ pending: pendingCount, label: activeLabel });
  return () => listeners.delete(listener);
}

/** Call when the app route changes (page open / navigation). */
export function beginPageNavigation() {
  pageNavigationActive = true;
}

/** Ends the page-navigation loading window (also called when all loaders finish). */
export function endPageNavigation() {
  pageNavigationActive = false;
}

export function isPageNavigationLoading() {
  return pageNavigationActive;
}

export function beginAppLoading(label) {
  pendingCount += 1;
  if (label) activeLabel = label;
  emit();
}

export function endAppLoading() {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount === 0) {
    activeLabel = "Loading…";
    endPageNavigation();
  }
  emit();
}

export function getAppLoadingState() {
  return { pending: pendingCount, label: activeLabel };
}
