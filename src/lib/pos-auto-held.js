const STORAGE_KEY = "centrix.pos.autoHeldOrder";

/**
 * Remember a hold created automatically when leaving POS with an open sale.
 * Prefer localHeldId (device park). Legacy saleId kept for old server-held parks.
 */
export function rememberAutoHeldOrder({
  localHeldId = null,
  holdLabel = null,
  saleId = null,
  orderNum = null,
  at = Date.now(),
} = {}) {
  const localId = localHeldId != null ? String(localHeldId).trim() : "";
  const id = Number(saleId);
  if (!localId && (!Number.isFinite(id) || id <= 0)) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        localHeldId: localId || null,
        holdLabel: holdLabel != null ? String(holdLabel) : null,
        saleId: Number.isFinite(id) && id > 0 ? id : null,
        orderNum: orderNum != null ? Number(orderNum) : null,
        at,
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function peekAutoHeldOrder() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const localHeldId =
      parsed?.localHeldId != null && String(parsed.localHeldId).trim()
        ? String(parsed.localHeldId).trim()
        : null;
    const saleId = Number(parsed?.saleId);
    if (!localHeldId && (!Number.isFinite(saleId) || saleId <= 0)) return null;
    return {
      localHeldId,
      holdLabel: parsed?.holdLabel != null ? String(parsed.holdLabel) : null,
      saleId: Number.isFinite(saleId) && saleId > 0 ? saleId : null,
      orderNum: parsed.orderNum != null ? Number(parsed.orderNum) : null,
      at: Number(parsed.at) || null,
    };
  } catch {
    return null;
  }
}

export function clearAutoHeldOrder() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
