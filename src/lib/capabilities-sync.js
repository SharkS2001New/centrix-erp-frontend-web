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
 * True when the cheap /erp/capabilities/version payload disagrees with the
 * stored session (org generation bumped, or this user's role / admin flag changed).
 */
export function capabilitiesAccessStampChanged(storedCapabilities, storedUser, versionPayload) {
  if (!versionPayload || typeof versionPayload !== "object") return false;

  const storedVersion = readCapabilitiesVersion(storedCapabilities);
  const nextVersion = readCapabilitiesVersion(versionPayload);
  if (nextVersion != null && storedVersion != null && nextVersion !== storedVersion) {
    return true;
  }

  const nextRoleId = versionPayload.role_id != null ? Number(versionPayload.role_id) : null;
  const storedRoleId = storedUser?.role_id != null ? Number(storedUser.role_id) : null;
  if (
    Number.isFinite(nextRoleId) &&
    Number.isFinite(storedRoleId) &&
    nextRoleId !== storedRoleId
  ) {
    return true;
  }

  const nextAdmin = Boolean(versionPayload.is_admin);
  const storedAdmin = Boolean(
    storedCapabilities?.is_admin ?? storedUser?.is_admin,
  );
  if (nextAdmin !== storedAdmin) {
    return true;
  }

  return false;
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
