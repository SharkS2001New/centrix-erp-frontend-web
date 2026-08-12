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

/**
 * Previous-order edit is only allowed for Cash Sales written on this PC.
 *
 * - Stamped sale → must match `getPosDeviceIdentifier()`
 * - Unstamped local pending outbox (`offline:…`) → allow (this till wrote it)
 * - Unstamped server sale → block (safe after a PC move; no durable device claim)
 */
export function saleBelongsToCurrentPosDevice(saleOrRow, options = {}) {
  const { allowUnstampedLocalOutbox = true } = options;
  const current = normalizeDeviceIdentifier(getPosDeviceIdentifier());
  if (!current) return true;

  const stamped = resolveSalePosDeviceId(saleOrRow);
  if (stamped) return stamped === current;

  if (!allowUnstampedLocalOutbox) return false;

  const id = String(saleOrRow?.id ?? "");
  if (id.startsWith("offline:")) return true;
  if (saleOrRow?.offline_pending_sync) return true;
  // Local outbox row that has not been mirrored from the server list yet.
  if (
    saleOrRow?.client_sale_uuid &&
    (saleOrRow.sync_kind === "sale" || saleOrRow.sync_kind === "previous_order_edit")
  ) {
    return true;
  }
  return false;
}

export const POS_OTHER_DEVICE_EDIT_BLOCK_MESSAGE =
  "This Cash Sales # was written on another device. Previous-order edit is only available on the till that printed the receipt.";
