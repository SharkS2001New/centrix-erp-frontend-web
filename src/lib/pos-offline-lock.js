/**
 * Serialize External POS offline IndexedDB / outbox work across browser tabs.
 */
export async function withPosOfflineExclusiveLock(callback) {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("centrix-pos-offline-v1", { mode: "exclusive" }, callback);
  }
  return callback();
}
