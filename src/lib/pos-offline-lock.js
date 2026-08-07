/**
 * Serialize External POS offline IndexedDB / outbox work across browser tabs.
 * Uses Web Locks when available; falls back to a localStorage mutex.
 */

const LOCK_NAME = "centrix-pos-offline-v1";
const LS_KEY = "centrix.pos.offline.lock";
const LS_TTL_MS = 120_000;

function readLsLock() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.owner || !parsed?.until) return null;
    return parsed;
  } catch {
    return null;
  }
}

function tryAcquireLsLock(owner) {
  const now = Date.now();
  const existing = readLsLock();
  if (existing && existing.until > now && existing.owner !== owner) {
    return false;
  }
  const payload = { owner, until: now + LS_TTL_MS };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    const verify = readLsLock();
    return verify?.owner === owner;
  } catch {
    return true; // private mode / blocked storage — proceed without cross-tab lock
  }
}

function releaseLsLock(owner) {
  try {
    const existing = readLsLock();
    if (!existing || existing.owner === owner) {
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    /* ignore */
  }
}

async function withLocalStorageLock(callback) {
  const owner = `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const started = Date.now();
  while (!tryAcquireLsLock(owner)) {
    if (Date.now() - started > 30_000) {
      // Do not block forever — proceed; Web Lock path is preferred when available.
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 80));
  }
  try {
    return await callback();
  } finally {
    releaseLsLock(owner);
  }
}

/**
 * @template T
 * @param {() => Promise<T> | T} callback
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withPosOfflineExclusiveLock(callback, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? 30_000);
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer =
      controller && Number.isFinite(timeoutMs) && timeoutMs > 0
        ? window.setTimeout(() => {
            try {
              controller.abort();
            } catch {
              /* ignore */
            }
          }, timeoutMs)
        : null;
    try {
      return await navigator.locks.request(
        LOCK_NAME,
        {
          mode: "exclusive",
          ...(controller ? { signal: controller.signal } : {}),
        },
        callback,
      );
    } catch (err) {
      // Timed out waiting for another tab — still run (localStorage mutex has its own cap).
      if (err?.name === "AbortError") {
        return withLocalStorageLock(callback);
      }
      throw err;
    } finally {
      if (timer != null) window.clearTimeout(timer);
    }
  }
  return withLocalStorageLock(callback);
}
