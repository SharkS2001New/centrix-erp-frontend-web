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
