/** Normalize permission ids for consistent Set lookups (API may return strings). */
export function normalizePermissionId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function permissionIdSet(ids) {
  const set = new Set();
  for (const id of ids ?? []) {
    const n = normalizePermissionId(id);
    if (n != null) set.add(n);
  }
  return set;
}

export function normalizeRoleId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}
