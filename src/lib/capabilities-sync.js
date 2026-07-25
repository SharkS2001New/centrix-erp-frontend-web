/** Server-side org capabilities generation — bumps when settings/roles change or cache is cleared. */
export function readCapabilitiesVersion(capabilities) {
  const raw = capabilities?.capabilities_version;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function capabilitiesVersionChanged(previous, next) {
  const prevVersion = readCapabilitiesVersion(previous);
  const nextVersion = readCapabilitiesVersion(next);
  if (nextVersion == null) return false;
  if (prevVersion == null) return false;
  return prevVersion !== nextVersion;
}

/**
 * True when this document load was a browser reload (F5 / Ctrl+R / hard refresh).
 * External POS uses cached capabilities until reload (or an explicit Refresh).
 */
export function isBrowserReloadNavigation() {
  if (typeof performance === "undefined") return false;
  try {
    const entry = performance.getEntriesByType?.("navigation")?.[0];
    if (entry && typeof entry.type === "string") {
      return entry.type === "reload";
    }
    // Legacy PerformanceNavigation.TYPE_RELOAD === 1
    return performance.navigation?.type === 1;
  } catch {
    return false;
  }
}
