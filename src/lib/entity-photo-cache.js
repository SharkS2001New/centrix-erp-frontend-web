/**
 * Session memory cache for authenticated entity photos (products, customers, employees, logos).
 * Avoids re-fetching the same image while scrolling lists / re-rendering cells.
 */

/** @type {Map<string, string>} */
const memoryUrls = new Map();
/** @type {Map<string, Promise<string|null>>} */
const inflight = new Map();
const MAX_ENTRIES = 200;

function isDisplayableImageBlob(blob) {
  if (!blob || blob.size <= 0) return false;
  if (blob.type.startsWith("image/")) return true;
  return blob.type === "" || blob.type === "application/octet-stream";
}

function remember(key, objectUrl) {
  if (memoryUrls.size >= MAX_ENTRIES) {
    const oldest = memoryUrls.keys().next().value;
    if (oldest != null) {
      const prev = memoryUrls.get(oldest);
      if (prev) URL.revokeObjectURL(prev);
      memoryUrls.delete(oldest);
    }
  }
  const existing = memoryUrls.get(key);
  if (existing && existing !== objectUrl) URL.revokeObjectURL(existing);
  memoryUrls.set(key, objectUrl);
  return objectUrl;
}

export function peekEntityPhotoCache(url) {
  const key = String(url ?? "").trim();
  if (!key) return null;
  return memoryUrls.get(key) ?? null;
}

/** Drop cached blob URLs matching an exact URL or URL prefix (after replace upload). */
export function invalidateEntityPhotoCache(urlOrPrefix) {
  const needle = String(urlOrPrefix ?? "").trim();
  if (!needle) return;
  for (const [key, objectUrl] of [...memoryUrls.entries()]) {
    if (key === needle || key.startsWith(needle)) {
      URL.revokeObjectURL(objectUrl);
      memoryUrls.delete(key);
    }
  }
}

/**
 * Resolve a blob: URL for an authenticated image endpoint.
 * Uses memory → browser HTTP cache (force-cache) → network.
 *
 * @param {string} url Absolute API URL
 * @param {{ headers?: HeadersInit, credentials?: RequestCredentials }} [options]
 * @returns {Promise<string|null>}
 */
export async function resolveEntityPhotoUrl(url, options = {}) {
  const key = String(url ?? "").trim();
  if (!key) return null;

  const cached = memoryUrls.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const res = await fetch(key, {
        method: "GET",
        headers: options.headers,
        credentials: options.credentials,
        // Honour Cache-Control / ETag from the API (private, max-age=…).
        cache: "force-cache",
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!isDisplayableImageBlob(blob)) return null;
      return remember(key, URL.createObjectURL(blob));
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, job);
  return job;
}
