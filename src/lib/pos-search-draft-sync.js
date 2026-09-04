/**
 * Decide whether parent `searchQuery` may overwrite the local input draft.
 * Parent React state lags behind fast keystrokes — never regress or clear mid-type.
 *
 * Critical race (fast typing): parent still holds a parked product code / prior query
 * while the cashier has already replaced the field (select-all + type). A naive sync
 * would push the stale parent back into the input and wipe what they just typed.
 */
export function shouldSyncParentSearchQuery(parent, local, { allowParentClear } = {}) {
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

  // Parent is ahead of a still-empty field (park / barcode seed after clear).
  if (l === "") return true;

  // Parent extends what the cashier typed (rare; e.g. scanner appends).
  if (p.startsWith(l) && p.length > l.length) return true;

  // Divergent strings (parked code vs new name search, or select-all rewrite while
  // parent state still has the old value). Never clobber the live draft — callers
  // that intentionally park use setDraftValue / commitDraft, not parent sync.
  return false;
}
