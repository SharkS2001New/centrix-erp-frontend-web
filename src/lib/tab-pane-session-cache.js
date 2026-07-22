/**
 * In-memory cache for keep-alive / remounted tab panes.
 * Survives React remounts for the same pane within a browser session.
 */

/** @type {Map<string, { savedAt: number, data: unknown }>} */
const store = new Map();

const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * @param {string | null | undefined} paneHref
 * @returns {string | null}
 */
function paneStoreKey(paneHref) {
  if (!paneHref) return null;
  try {
    const path = String(paneHref).split("?")[0] || "";
    return path || null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} paneHref
 * @param {string} slot
 * @returns {string | null}
 */
function entryKey(paneHref, slot) {
  const pane = paneStoreKey(paneHref);
  if (!pane || slot == null || slot === "") return null;
  return `${pane}::${slot}`;
}

/**
 * @param {string | null | undefined} paneHref
 * @param {string} slot
 * @returns {unknown | null}
 */
export function readTabPaneCache(paneHref, slot) {
  const key = entryKey(paneHref, slot);
  if (!key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * @param {string | null | undefined} paneHref
 * @param {string} slot
 * @param {unknown} data
 */
export function writeTabPaneCache(paneHref, slot, data) {
  const key = entryKey(paneHref, slot);
  if (!key) return;
  store.set(key, { savedAt: Date.now(), data });
}

/**
 * @param {string | null | undefined} paneHref
 * @param {string} [slot] when omitted, clears all slots for the pane
 */
export function clearTabPaneCache(paneHref, slot) {
  const pane = paneStoreKey(paneHref);
  if (!pane) return;
  if (slot != null && slot !== "") {
    store.delete(`${pane}::${slot}`);
    return;
  }
  const prefix = `${pane}::`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
