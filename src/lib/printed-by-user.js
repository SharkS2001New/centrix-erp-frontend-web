/** Display name for "Printed By" on document footers. */
export function resolvePrintedByUser(userOrName) {
  if (userOrName == null) return null;
  if (typeof userOrName === "string") {
    const trimmed = userOrName.trim();
    return trimmed || null;
  }
  return userOrName.full_name ?? userOrName.username ?? null;
}
