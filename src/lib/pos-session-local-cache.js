/**
 * Reset External POS IndexedDB after Z print only.
 * Incomplete wipes are retried on the next POS boot via wipe_pending.
 *
 * After the first verified Z wipe on a device, per-cashier IndexedDB mode is
 * enabled so later cashiers do not inherit each other's local sales.
 */

import {
  idbSetMeta,
  idbVerifyOfflineStoresEmpty,
  idbWipeDatabaseCompletely,
  idbClearAllStores,
  idbDeleteLegacyOfflineDatabase,
  setPosOfflineDbOwner,
  enablePosOfflinePerCashierDb,
  isPosOfflinePerCashierEnabled,
  POS_OFFLINE_OWNER_META_KEY,
} from "@/lib/pos-offline-db";
import { withPosOfflineExclusiveLock } from "@/lib/pos-offline-lock";

/** Survives a hung tab: next POS boot finishes the wipe if Z could not verify empty. */
export const POS_OFFLINE_WIPE_PENDING_LS_KEY = "centrix.pos.offline.wipe_pending";

function ownerFingerprint(organizationId, userId) {
  const organization_id = Number(organizationId);
  const user_id = Number(userId);
  if (!Number.isFinite(organization_id) || organization_id <= 0) return null;
  if (!Number.isFinite(user_id) || user_id <= 0) return null;
  return { organization_id, user_id };
}

function markWipePending() {
  try {
    localStorage.setItem(POS_OFFLINE_WIPE_PENDING_LS_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

function clearWipePending() {
  try {
    localStorage.removeItem(POS_OFFLINE_WIPE_PENDING_LS_KEY);
  } catch {
    /* ignore */
  }
}

export function isPosOfflineWipePending() {
  try {
    return Boolean(localStorage.getItem(POS_OFFLINE_WIPE_PENDING_LS_KEY));
  } catch {
    return false;
  }
}

/**
 * Wipe the active External POS IndexedDB completely (carts, holds, catalog, outbox, meta).
 * Call only after a successful Z report print (or to finish a prior Z wipe).
 *
 * On verified wipe, enables per-cashier DB mode for the next session on this device.
 *
 * @returns {Promise<{ wiped: true, verified: boolean, mode: "delete" | "clear", preservedOutbox: number, attempts: number, perCashierEnabled: boolean }>}
 */
export async function clearPosSessionLocalCache() {
  markWipePending();

  let result = { mode: "clear", verified: false, attempts: 0 };
  try {
    result = await idbWipeDatabaseCompletely({ attempts: 3 });
  } catch (err) {
    console.warn("POS IndexedDB wipe threw; clearing stores instead", err);
    try {
      await idbClearAllStores();
      const check = await idbVerifyOfflineStoresEmpty();
      result = {
        mode: "clear",
        verified: check.empty,
        attempts: 1,
      };
    } catch (clearErr) {
      console.warn("POS IndexedDB clear-all also failed", clearErr);
      result = { mode: "clear", verified: false, attempts: 1 };
    }
  }

  let perCashierEnabled = isPosOfflinePerCashierEnabled();
  if (result.verified) {
    clearWipePending();
    // Cutover: from the next POS open, each cashier gets their own IndexedDB.
    enablePosOfflinePerCashierDb();
    perCashierEnabled = true;
    // Drop the legacy shared file so old shared sales cannot be reopened.
    try {
      await idbDeleteLegacyOfflineDatabase();
    } catch (err) {
      console.warn("Could not delete legacy POS IndexedDB after Z", err);
    }
  } else {
    markWipePending();
    console.warn(
      "POS IndexedDB wipe could not verify empty stores — will retry on next POS open",
    );
  }

  return {
    wiped: true,
    verified: Boolean(result.verified),
    mode: result.mode === "delete" ? "delete" : "clear",
    preservedOutbox: 0,
    attempts: Number(result.attempts) || 0,
    perCashierEnabled,
  };
}

/**
 * If a prior Z left wipe_pending, finish truncating before selling again.
 * @returns {Promise<{ wiped: boolean, verified: boolean }>}
 */
export async function settlePendingPosOfflineWipe() {
  if (!isPosOfflineWipePending()) {
    return { wiped: false, verified: true };
  }
  const result = await clearPosSessionLocalCache();
  return { wiped: true, verified: Boolean(result.verified) };
}

/**
 * Bind this browser tab to the logged-in cashier's IndexedDB.
 * Does not wipe on cashier change — local data is cleared only when Z is printed
 * (or when finishing a pending Z wipe). After per-cashier cutover, each cashier
 * opens a separate DB so they never see each other's local sales.
 *
 * @param {{ organizationId?: number|string|null, userId?: number|string|null }} owner
 * @returns {Promise<{ wiped: boolean, owner: { organization_id: number, user_id: number } | null, dbName?: string }>}
 */
export async function ensurePosOfflineOwnerIsolation(owner = {}) {
  const next = ownerFingerprint(owner.organizationId, owner.userId);
  if (!next) {
    return { wiped: false, owner: null };
  }

  // Route IDB opens to this cashier (no-op name change until per-cashier is enabled).
  const routed = await setPosOfflineDbOwner({
    organizationId: next.organization_id,
    userId: next.user_id,
  });

  let wiped = false;

  // Finish an incomplete Z wipe — never wipe solely because the cashier changed.
  if (isPosOfflineWipePending()) {
    await clearPosSessionLocalCache();
    wiped = true;
    // Re-bind after wipe (legacy delete + per-cashier enable may change the target name).
    await setPosOfflineDbOwner({
      organizationId: next.organization_id,
      userId: next.user_id,
    });
  }

  return withPosOfflineExclusiveLock(async () => {
    await idbSetMeta(POS_OFFLINE_OWNER_META_KEY, next);
    return { wiped, owner: next, dbName: routed.dbName };
  }, { timeoutMs: 12_000 });
}
