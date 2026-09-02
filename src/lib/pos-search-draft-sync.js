/**
 * Decide whether parent `searchQuery` may overwrite the local input draft.
 * Parent React state lags behind fast keystrokes — never regress or clear mid-type.
 */
export function shouldSyncParentSearchQuery(parent, local, { inputFocused, allowParentClear } = {}) {
  const p = String(parent ?? "");
  const l = String(local ?? "");
  if (p === l) return false;

  // Parent is behind the cashier (e.g. parent "Sug", draft "Sugar").
  if (p !== "" && l.startsWith(p) && l.length > p.length) return false;

  if (p === "") {
    if (l === "") return false;
    // Parent "" during a cart re-render must never wipe an in-progress query.
    return Boolean(allowParentClear);
  }

  return true;
}
