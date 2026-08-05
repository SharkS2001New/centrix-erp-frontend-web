/**
 * Reset External POS IndexedDB after Z / till session end.
 */

import {
  idbClearHeldParks,
  idbClearStore,
  idbListAllOutbox,
  idbPutOutboxSale,
} from "@/lib/pos-offline-db";
import { withPosOfflineExclusiveLock } from "@/lib/pos-offline-lock";

/**
 * Wipe External POS IndexedDB workspace after Z / session end so the next
 * till session starts clean (held parks, draft cart, reserved numbers, catalog).
 *
 * Unsynced outbox rows are kept (re-queued as pending) so offline sales are not lost.
 *
 * @returns {Promise<{ preservedOutbox: number }>}
 */
export async function clearPosSessionLocalCache() {
  return withPosOfflineExclusiveLock(async () => {
    const allOutbox = await idbListAllOutbox();
    const keepOutbox = allOutbox.filter((row) => {
      const status = String(row?.sync_status ?? "");
      return status === "pending" || status === "error" || status === "syncing";
    });

    await idbClearHeldParks();
    await idbClearStore("local_cart");
    await idbClearStore("order_slots");
    await idbClearStore("order_numbers");
    await idbClearStore("catalog");
    await idbClearStore("meta");
    await idbClearStore("outbox");

    for (const row of keepOutbox) {
      const status = String(row?.sync_status ?? "");
      await idbPutOutboxSale(
        status === "syncing"
          ? {
              ...row,
              sync_status: "pending",
              sync_started_at_ms: null,
              revision_at_sync: null,
            }
          : row,
      );
    }

    return { preservedOutbox: keepOutbox.length };
  });
}
