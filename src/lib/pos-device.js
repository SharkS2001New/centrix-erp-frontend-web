const STORAGE_KEY = "centrix_pos_device_id";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable POS computer identifier stored in localStorage (used for till-computer locks). */
export function getPosDeviceIdentifier() {
  if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") {
    return null;
  }
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function normalizeDeviceIdentifier(value) {
  return String(value ?? "").trim();
}

/**
 * Resolve the POS till device that wrote this sale / outbox row.
 * Checks sale fields, fulfillment_meta, and offline outbox payloads.
 */
export function resolveSalePosDeviceId(saleOrRow) {
  if (saleOrRow == null || typeof saleOrRow !== "object") return null;
  const meta =
    saleOrRow.fulfillment_meta && typeof saleOrRow.fulfillment_meta === "object"
      ? saleOrRow.fulfillment_meta
      : null;
  const payload =
    saleOrRow.sale_payload && typeof saleOrRow.sale_payload === "object"
      ? saleOrRow.sale_payload
      : null;
  const payloadMeta =
    payload?.fulfillment_meta && typeof payload.fulfillment_meta === "object"
      ? payload.fulfillment_meta
      : null;
  const checkout =
    saleOrRow.checkout_body && typeof saleOrRow.checkout_body === "object"
      ? saleOrRow.checkout_body
      : null;

  const candidates = [
    saleOrRow.pos_device_id,
    meta?.pos_device_id,
    payload?.pos_device_id,
    payloadMeta?.pos_device_id,
    checkout?.pos_device_id,
  ];
  for (const value of candidates) {
    const id = normalizeDeviceIdentifier(value);
    if (id) return id;
  }
  return null;
}

/** True when this row is clearly backed by IndexedDB on this machine. */
export function isLocalPosOutboxSaleRow(saleOrRow) {
  if (saleOrRow == null || typeof saleOrRow !== "object") return false;
  if (saleOrRow._local_synced_mirror) return true;
  if (saleOrRow.offline_pending_sync) return true;
  const id = String(saleOrRow.id ?? "");
  if (id.startsWith("offline:")) return true;
  if (String(saleOrRow.offline_client_uuid ?? "").trim()) return true;
  if (
    String(saleOrRow.client_sale_uuid ?? "").trim() &&
    (saleOrRow.sync_kind === "sale" ||
      saleOrRow.sync_kind === "previous_order_edit" ||
      saleOrRow.sync_kind === "online_mirror" ||
      saleOrRow.sync_status === "synced" ||
      saleOrRow.sync_status === "pending" ||
      saleOrRow.sync_status === "editing")
  ) {
    return true;
  }
  return false;
}

/** Device id to send on restore-to-cart — always this computer, never spoof the receipt stamp. */
export function posDeviceIdForRestoreRequest(_saleOrRow = null) {
  return normalizeDeviceIdentifier(getPosDeviceIdentifier()) || null;
}
