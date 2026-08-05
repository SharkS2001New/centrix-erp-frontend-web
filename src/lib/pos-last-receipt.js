/**
 * Last completed POS receipt for Reprint — survives workspace clear and module remount.
 * Kept in sessionStorage for the browser tab (cleared on logout / tab close).
 * Stores kra_response so External POS can reprint the eTIMS QR without admin permissions.
 */

function storageKey(userId, branchId) {
  return `centrix.pos.lastReceipt.${userId ?? "anon"}.${branchId ?? "none"}`;
}

function compactKraResponse(sale) {
  const kra = sale?.kra_response ?? sale?.kraResponse ?? null;
  if (!kra || typeof kra !== "object") return null;
  return {
    id: kra.id ?? null,
    sale_id: kra.sale_id ?? sale?.id ?? null,
    status: kra.status ?? null,
    invoice_number: kra.invoice_number ?? null,
    signature_link: kra.signature_link ?? null,
    receipt_signature: kra.receipt_signature ?? null,
    serial_number: kra.serial_number ?? null,
    kra_timestamp: kra.kra_timestamp ?? null,
    response_payload: kra.response_payload ?? null,
  };
}

export function rememberPosLastReceipt(userId, branchId, sale) {
  if (!sale?.id || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      storageKey(userId, branchId),
      JSON.stringify({
        id: sale.id,
        order_num: sale.order_num ?? null,
        pos_order_num: sale.pos_order_num ?? null,
        pos_order_date: sale.pos_order_date ?? null,
        channel: sale.channel ?? sale.order_source ?? null,
        kra_response: compactKraResponse(sale),
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
    return {
      id: parsed.id,
      order_num: parsed.order_num ?? null,
      pos_order_num: parsed.pos_order_num ?? null,
      pos_order_date: parsed.pos_order_date ?? null,
      channel: parsed.channel ?? null,
      order_source: parsed.channel ?? null,
      kra_response: parsed.kra_response ?? null,
    };
  } catch {
    return null;
  }
}

export function clearPosLastReceipt(userId, branchId) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(userId, branchId));
  } catch {
    /* ignore */
  }
}
