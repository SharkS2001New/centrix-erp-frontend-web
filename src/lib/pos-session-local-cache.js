/**
 * Reset External POS IndexedDB after Z / till session end, and isolate by cashier.
 */

import {
  idbClearAllStores,
  idbGetMeta,
  idbSetMeta,
  idbWipeDatabaseCompletely,
  POS_OFFLINE_OWNER_META_KEY,
} from "@/lib/pos-offline-db";
import { withPosOfflineExclusiveLock } from "@/lib/pos-offline-lock";

function ownerFingerprint(organizationId, userId) {
  const organization_id = Number(organizationId);
  const user_id = Number(userId);
  if (!Number.isFinite(organization_id) || organization_id <= 0) return null;
  if (!Number.isFinite(user_id) || user_id <= 0) return null;
  return { organization_id, user_id };
}

function ownersMatch(a, b) {
  if (!a || !b) return false;
  return Number(a.organization_id) === Number(b.organization_id)
    && Number(a.user_id) === Number(b.user_id);
}

/**
 * Wipe External POS IndexedDB completely (carts, holds, catalog, outbox, meta).
 * Used after Z print and when a different cashier takes over the device.
 *
 * @returns {Promise<{ wiped: true, mode: "delete" | "clear" }>}
 */
export async function clearPosSessionLocalCache() {
  return withPosOfflineExclusiveLock(async () => {
    try {
      await idbWipeDatabaseCompletely();
      return { wiped: true, mode: "delete", preservedOutbox: 0 };
    } catch (err) {
      console.warn("POS IndexedDB deleteDatabase failed; clearing stores instead", err);
      await idbClearAllStores();
      return { wiped: true, mode: "clear", preservedOutbox: 0 };
    }
  }, { timeoutMs: 12_000 });
}

/**
 * If another cashier/org previously owned this browser's POS IndexedDB, wipe it
 * before the new cashier can see carts, holds, or offline sales.
 *
 * @param {{ organizationId?: number|string|null, userId?: number|string|null }} owner
 * @returns {Promise<{ wiped: boolean, owner: { organization_id: number, user_id: number } | null }>}
 */
export async function ensurePosOfflineOwnerIsolation(owner = {}) {
  const next = ownerFingerprint(owner.organizationId, owner.userId);
  if (!next) {
    return { wiped: false, owner: null };
  }

  return withPosOfflineExclusiveLock(async () => {
    let previous = null;
    try {
      previous = await idbGetMeta(POS_OFFLINE_OWNER_META_KEY);
    } catch {
      previous = null;
    }

    const mustWipe = previous != null && !ownersMatch(previous, next);
    if (mustWipe) {
      try {
        await idbWipeDatabaseCompletely();
      } catch (err) {
        console.warn("POS owner switch wipe failed; clearing stores", err);
        await idbClearAllStores();
      }
    }

    await idbSetMeta(POS_OFFLINE_OWNER_META_KEY, next);
    return { wiped: mustWipe, owner: next };
  }, { timeoutMs: 12_000 });
}
