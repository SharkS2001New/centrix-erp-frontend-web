/** Module-level loading counter for global preloader (no React dependency). */

let pendingCount = 0;
let activeLabel = "Loading…";
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

export function beginAppLoading(label) {
  pendingCount += 1;
  if (label) activeLabel = label;
  emit();
}

export function endAppLoading() {
  pendingCount = Math.max(0, pendingCount - 1);
  if (pendingCount === 0) activeLabel = "Loading…";
  emit();
}

export function getAppLoadingState() {
  return { pending: pendingCount, label: activeLabel };
}
