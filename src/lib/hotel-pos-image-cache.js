/**
 * Session + IndexedDB cache for Hotel POS product photos.
 * Object URLs live for the POS session so tiles do not re-hit IDB/network on re-render.
 */

import { apiBaseOrigin } from "@/lib/api";
import { apiFetchCredentials } from "@/lib/auth-config";
import { getToken } from "@/lib/auth-storage";
import { idbGetCatalogImage, idbPutCatalogImage } from "@/lib/hotel-pos-offline-db";

/** @type {Map<string, string>} */
const memoryUrls = new Map();
/** @type {Map<string, Promise<string|null>>} */
const inflight = new Map();

function productImageFileUrl(productCode) {
  return `${apiBaseOrigin()}/api/v1/products/${encodeURIComponent(productCode)}/image/file`;
}

function isDisplayableImageBlob(blob) {
  if (!blob || blob.size < 32) return false;
  if (blob.type.startsWith("image/")) return true;
  return blob.type === "" || blob.type === "application/octet-stream";
}

export function peekHotelPosCachedImageUrl(productCode) {
  const code = String(productCode ?? "").trim();
  if (!code) return null;
  return memoryUrls.get(code) ?? null;
}

function rememberUrl(code, url) {
  const prev = memoryUrls.get(code);
  if (prev && prev !== url) URL.revokeObjectURL(prev);
  memoryUrls.set(code, url);
  return url;
}

async function fetchAndStoreImage(code) {
  const token = getToken();
  const headers = { Accept: "image/*,*/*" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(productImageFileUrl(code), {
    headers,
    credentials: apiFetchCredentials(),
    cache: "force-cache",
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!isDisplayableImageBlob(blob)) return null;
  await idbPutCatalogImage(code, blob, blob.type || "image/jpeg").catch(() => {});
  return rememberUrl(code, URL.createObjectURL(blob));
}

/**
 * Resolve a blob: URL for a product photo (memory → IndexedDB → network).
 * Caller must not revoke the URL; it is owned by the session cache.
 */
export async function resolveHotelPosCachedImageUrl(productCode) {
  const code = String(productCode ?? "").trim();
  if (!code) return null;
  const cached = memoryUrls.get(code);
  if (cached) return cached;

  const pending = inflight.get(code);
  if (pending) return pending;

  const job = (async () => {
    try {
      const row = await idbGetCatalogImage(code);
      if (row?.blob && isDisplayableImageBlob(row.blob)) {
        return rememberUrl(code, URL.createObjectURL(row.blob));
      }
      return await fetchAndStoreImage(code);
    } catch {
      return null;
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, job);
  return job;
}

export async function primeHotelPosImageCacheFromIndexedDb(productCodes = []) {
  const codes = [...new Set((productCodes ?? []).map((c) => String(c ?? "").trim()).filter(Boolean))];
  const BATCH = 24;
  for (let i = 0; i < codes.length; i += BATCH) {
    const slice = codes.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (code) => {
        if (memoryUrls.has(code) || inflight.has(code)) return;
        try {
          const row = await idbGetCatalogImage(code);
          if (row?.blob && isDisplayableImageBlob(row.blob)) {
            rememberUrl(code, URL.createObjectURL(row.blob));
          }
        } catch {
          /* skip */
        }
      }),
    );
  }
}
