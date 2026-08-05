const STORAGE_KEY = "centrix_pos_device_id";

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable POS computer identifier stored in localStorage (used for till-computer locks). */
export function getPosDeviceIdentifier() {
  if (typeof window === "undefined") return null;
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
