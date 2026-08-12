import {
  CLASSIC_POS_THEME_DEFAULT,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";

export const POS_USER_THEME_STORAGE_PREFIX = "centrix.pos.user_theme";

const POS_USER_THEME_CHANGE_EVENT = "centrix-pos-user-theme-change";
const POS_USER_THEME_ORG_DEFAULT = Object.freeze({ template: null, useOrgDefault: true });

/** Stable snapshot cache — useSyncExternalStore requires referential equality. */
const snapshotCacheByKey = new Map();

function invalidatePosUserThemePreferenceSnapshotCache() {
  snapshotCacheByKey.clear();
}

function storageKey(userId, organizationId) {
  const uid = Number(userId);
  const oid = Number(organizationId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  if (!Number.isFinite(oid) || oid <= 0) return `${POS_USER_THEME_STORAGE_PREFIX}.u${uid}`;
  return `${POS_USER_THEME_STORAGE_PREFIX}.o${oid}.u${uid}`;
}

function hasThemeStorage() {
  return typeof localStorage !== "undefined";
}

/** @returns {{ template: string|null, useOrgDefault: boolean } | null} */
export function readPosUserThemePreference(userId, organizationId) {
  if (!hasThemeStorage()) return null;
  const key = storageKey(userId, organizationId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.useOrgDefault === true || parsed?.template == null) {
      return POS_USER_THEME_ORG_DEFAULT;
    }
    return {
      template: normalizeClassicPosThemeTemplate(parsed.template),
      useOrgDefault: false,
    };
  } catch {
    return null;
  }
}

export function writePosUserThemePreference(userId, organizationId, { template = null, useOrgDefault = false } = {}) {
  if (!hasThemeStorage()) return null;
  const key = storageKey(userId, organizationId);
  if (!key) return null;
  if (useOrgDefault || template == null) {
    localStorage.removeItem(key);
    invalidatePosUserThemePreferenceSnapshotCache();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(POS_USER_THEME_CHANGE_EVENT));
    }
    return POS_USER_THEME_ORG_DEFAULT;
  }
  const next = {
    template: normalizeClassicPosThemeTemplate(template),
    useOrgDefault: false,
  };
  localStorage.setItem(key, JSON.stringify(next));
  invalidatePosUserThemePreferenceSnapshotCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POS_USER_THEME_CHANGE_EVENT));
  }
  return next;
}

/** Cached snapshot for useSyncExternalStore — same storage value → same object reference. */
export function getPosUserThemePreferenceSnapshot(userId, organizationId) {
  if (!hasThemeStorage()) return null;
  const key = storageKey(userId, organizationId);
  if (!key) return null;

  let raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }

  const cacheKey = `${key}\0${raw ?? ""}`;
  if (snapshotCacheByKey.has(cacheKey)) {
    return snapshotCacheByKey.get(cacheKey);
  }

  const value = readPosUserThemePreference(userId, organizationId);
  snapshotCacheByKey.set(cacheKey, value);
  if (snapshotCacheByKey.size > 32) {
    const oldest = snapshotCacheByKey.keys().next().value;
    snapshotCacheByKey.delete(oldest);
  }
  return value;
}

export function clearPosUserThemePreference(userId, organizationId) {
  return writePosUserThemePreference(userId, organizationId, { useOrgDefault: true });
}

export function subscribePosUserThemePreference(listener) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(POS_USER_THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(POS_USER_THEME_CHANGE_EVENT, handler);
}

/** Effective External POS template — user override wins when set. */
export function resolveEffectivePosThemeTemplate(orgTemplate, userPreference) {
  const org = normalizeClassicPosThemeTemplate(orgTemplate ?? CLASSIC_POS_THEME_DEFAULT);
  if (!userPreference || userPreference.useOrgDefault || !userPreference.template) {
    return org;
  }
  return normalizeClassicPosThemeTemplate(userPreference.template);
}
