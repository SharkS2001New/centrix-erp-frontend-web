/** Session-scoped org cache — 1h TTL unless invalidated by CUD mutations. */

export const ORG_CACHE_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { data?: unknown, promise?: Promise<unknown>, fetchedAt?: number, ttlMs?: number }>} */
const entries = new Map();

export function orgCacheKey(organizationId, resource, scope = "") {
  const org = String(organizationId ?? "0");
  const suffix = scope ? `:${scope}` : "";
  return `org:${org}:${resource}${suffix}`;
}

function isFresh(entry) {
  if (!entry?.data || entry.fetchedAt == null) return false;
  const ttl = entry.ttlMs ?? ORG_CACHE_TTL_MS;
  return Date.now() - entry.fetchedAt <= ttl;
}

export function readOrgCache(key) {
  const hit = entries.get(key);
  return isFresh(hit) ? hit.data : null;
}

export function writeOrgCache(key, data, { ttlMs = ORG_CACHE_TTL_MS } = {}) {
  entries.set(key, { data, fetchedAt: Date.now(), ttlMs });
}

export function deleteOrgCacheKey(key) {
  entries.delete(key);
}

/** @param {(key: string) => boolean} predicate */
export function invalidateOrgCacheWhere(predicate) {
  for (const key of [...entries.keys()]) {
    if (predicate(key)) entries.delete(key);
  }
}

export function invalidateOrgCacheResource(organizationId, resource, scopePrefix = "") {
  const org = String(organizationId ?? "0");
  const needle = scopePrefix
    ? `org:${org}:${resource}:${scopePrefix}`
    : `org:${org}:${resource}`;
  invalidateOrgCacheWhere((key) => key === needle || key.startsWith(`${needle}:`));
}

export function invalidateOrgCacheForOrg(organizationId) {
  const org = String(organizationId ?? "0");
  invalidateOrgCacheWhere((key) => key.startsWith(`org:${org}:`));
}

export function clearOrgCache() {
  entries.clear();
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @param {{ ttlMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function fetchOrgCached(key, loader, options = {}) {
  const ttlMs = options.ttlMs ?? ORG_CACHE_TTL_MS;
  const fresh = readOrgCache(key);
  if (fresh != null) return fresh;

  const hit = entries.get(key);
  if (hit?.promise) return hit.promise;

  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      writeOrgCache(key, data, { ttlMs });
      return data;
    })
    .catch((error) => {
      entries.delete(key);
      throw error;
    });

  entries.set(key, { promise, ttlMs });
  return promise;
}
