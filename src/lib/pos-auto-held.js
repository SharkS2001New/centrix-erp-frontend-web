const STORAGE_KEY = "centrix.pos.autoHeldOrder";

/** Remember a hold created automatically when leaving POS with an open sale. */
export function rememberAutoHeldOrder({ saleId, orderNum, at = Date.now() } = {}) {
  const id = Number(saleId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        saleId: id,
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
    const saleId = Number(parsed?.saleId);
    if (!Number.isFinite(saleId) || saleId <= 0) return null;
    return {
      saleId,
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
