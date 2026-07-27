/**
 * Last completed POS receipt for Reprint — survives workspace clear and module remount.
 * Kept in sessionStorage for the browser tab (cleared on logout / tab close).
 */

function storageKey(userId, branchId) {
  return `centrix.pos.lastReceipt.${userId ?? "anon"}.${branchId ?? "none"}`;
}

export function rememberPosLastReceipt(userId, branchId, sale) {
  if (!sale?.id || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(userId, branchId),
      JSON.stringify({
        id: sale.id,
        order_num: sale.order_num ?? null,
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readPosLastReceipt(userId, branchId) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId, branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id) return null;
    return { id: parsed.id, order_num: parsed.order_num ?? null };
  } catch {
    return null;
  }
}
