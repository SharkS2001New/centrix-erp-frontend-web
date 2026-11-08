/**
 * Session + IndexedDB cache for Hotel POS product photos (including R2-backed /image/file).
 * Cache stays warm until image_version / image_path changes (upload or replace).
 */

import { apiBaseOrigin } from "@/lib/api";
import { apiFetchCredentials } from "@/lib/auth-config";
import { getToken } from "@/lib/auth-storage";
import {
  idbDeleteCatalogImage,
  idbGetCatalogImage,
  idbPutCatalogImage,
} from "@/lib/hotel-pos-offline-db";

/** @type {Map<string, { url: string, version: string|null }>} */
const memoryEntries = new Map();
/** @type {Map<string, Promise<string|null>>} */
const inflight = new Map();

function productImageFileUrl(productCode, imageVersion = null) {
  const base = `${apiBaseOrigin()}/api/v1/products/${encodeURIComponent(productCode)}/image/file`;
  const version = String(imageVersion ?? "").trim();
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}

function normalizeVersion(imageVersion) {
  const version = String(imageVersion ?? "").trim();
  return version || null;
}

function isDisplayableImageBlob(blob) {
  if (!blob || blob.size < 32) return false;
  if (blob.type.startsWith("image/")) return true;
  return blob.type === "" || blob.type === "application/octet-stream";
}

function isCentrixProductImageApiUrl(url) {
  return typeof url === "string" && url.includes("/api/v1/products/") && url.includes("/image");
}

/** Catalogue / CDN URL the till can fetch without going through /image/file. */
export function hotelPosExternalImageUrl(imageUrl) {
  const url = String(imageUrl ?? "").trim();
  if (!url) return null;
  if (isCentrixProductImageApiUrl(url)) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:image/")) return url;
  return null;
}

/** Extract v= from catalogue image_url when image_version was not sent separately. */
export function hotelPosImageVersionFromUrl(imageUrl) {
  const url = String(imageUrl ?? "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url, apiBaseOrigin());
    const version = parsed.searchParams.get("v");
    return version ? String(version) : null;
  } catch {
    return null;
  }
}

export function peekHotelPosCachedImageUrl(productCode, imageVersion = null) {
  const code = String(productCode ?? "").trim();
  if (!code) return null;
  const entry = memoryEntries.get(code);
  if (!entry?.url) return null;
  const expected = normalizeVersion(imageVersion);
  if (expected && entry.version && entry.version !== expected) return null;
  return entry.url;
}

function rememberUrl(code, url, version = null) {
  const prev = memoryEntries.get(code);
  if (prev?.url && prev.url !== url) URL.revokeObjectURL(prev.url);
  memoryEntries.set(code, { url, version: normalizeVersion(version) });
  return url;
}

export function invalidateHotelPosProductImageCache(productCode) {
  const code = String(productCode ?? "").trim();
  if (!code) return;
  const prev = memoryEntries.get(code);
  if (prev?.url) URL.revokeObjectURL(prev.url);
  memoryEntries.delete(code);
  inflight.delete(code);
  void idbDeleteCatalogImage(code).catch(() => {});
}

async function fetchBlobFromUrl(url, { withAuth = false } = {}) {
  const headers = { Accept: "image/*,*/*" };
  if (withAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    headers,
    credentials: withAuth ? apiFetchCredentials() : "omit",
    // Versioned URLs (?v=) keep force-cache safe; path change ⇒ new URL.
    cache: "force-cache",
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!isDisplayableImageBlob(blob)) return null;
  return blob;
}

async function fetchAndStoreImage(code, fallbackUrl = null, imageVersion = null) {
  const version = normalizeVersion(imageVersion);
  let blob = await fetchBlobFromUrl(productImageFileUrl(code, version), { withAuth: true }).catch(
    () => null,
  );
  if (!blob) {
    const external = hotelPosExternalImageUrl(fallbackUrl);
    if (external) {
      blob = await fetchBlobFromUrl(external, { withAuth: false }).catch(() => null);
    }
  }
  if (!blob) return null;
  await idbPutCatalogImage(code, blob, blob.type || "image/jpeg", version).catch(() => {});
  return rememberUrl(code, URL.createObjectURL(blob), version);
}

/**
 * Resolve a blob: URL for a product photo (memory → IndexedDB → R2/API network).
 * @param {string} productCode
 * @param {{ fallbackUrl?: string|null, imageVersion?: string|null }} [options]
 */
export async function resolveHotelPosCachedImageUrl(productCode, options = {}) {
  const code = String(productCode ?? "").trim();
  if (!code) return null;
  const fallbackUrl = options?.fallbackUrl ?? null;
  const imageVersion =
    normalizeVersion(options?.imageVersion) || hotelPosImageVersionFromUrl(fallbackUrl);
  const inflightKey = `${code}::${imageVersion || "any"}`;

  const cached = peekHotelPosCachedImageUrl(code, imageVersion);
  if (cached) return cached;

  const pending = inflight.get(inflightKey);
  if (pending) return pending;

  const job = (async () => {
    try {
      const row = await idbGetCatalogImage(code);
      const rowVersion = normalizeVersion(row?.image_version);
      const versionOk =
        !imageVersion || !rowVersion || rowVersion === imageVersion;
      if (row?.blob && isDisplayableImageBlob(row.blob) && versionOk) {
        return rememberUrl(code, URL.createObjectURL(row.blob), rowVersion || imageVersion);
      }
      return await fetchAndStoreImage(code, fallbackUrl, imageVersion);
    } catch {
      return null;
    } finally {
      inflight.delete(inflightKey);
    }
  })();

  inflight.set(inflightKey, job);
  return job;
}

/**
 * @param {Array<string|{product_code?: string, productCode?: string, image_version?: string|null}>} productsOrCodes
 */
export async function primeHotelPosImageCacheFromIndexedDb(productsOrCodes = []) {
  const entries = (productsOrCodes ?? [])
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") {
        return { code: String(item).trim(), version: null };
      }
      const code = String(item?.product_code ?? item?.productCode ?? "").trim();
      return {
        code,
        version: normalizeVersion(item?.image_version ?? item?.imageVersion),
      };
    })
    .filter((item) => item.code);

  const BATCH = 24;
  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async ({ code, version }) => {
        if (peekHotelPosCachedImageUrl(code, version) || inflight.has(`${code}::${version || "any"}`)) {
          return;
        }
        try {
          const row = await idbGetCatalogImage(code);
          const rowVersion = normalizeVersion(row?.image_version);
          const versionOk = !version || !rowVersion || rowVersion === version;
          if (row?.blob && isDisplayableImageBlob(row.blob) && versionOk) {
            rememberUrl(code, URL.createObjectURL(row.blob), rowVersion || version);
          }
        } catch {
          /* skip */
        }
      }),
    );
  }
}
