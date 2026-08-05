import { beforeEach, describe, expect, it, vi } from "vitest";

const stores = {
  held_parks: new Map(),
  local_cart: new Map(),
  order_slots: new Map(),
  order_numbers: new Map(),
  catalog: new Map(),
  meta: new Map(),
  outbox: new Map(),
};

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

vi.mock("@/lib/pos-offline-db", () => ({
  idbClearHeldParks: async () => {
    stores.held_parks.clear();
  },
  idbClearStore: async (name) => {
    stores[name]?.clear();
  },
  idbListAllOutbox: async () => [...stores.outbox.values()],
  idbPutOutboxSale: async (row) => {
    stores.outbox.set(String(row.client_sale_uuid), row);
  },
}));

describe("clearPosSessionLocalCache", () => {
  beforeEach(() => {
    for (const store of Object.values(stores)) store.clear();
  });

  it("clears held parks, carts, catalog, and synced outbox after Z", async () => {
    const { clearPosSessionLocalCache } = await import("@/lib/pos-session-local-cache");

    stores.held_parks.set("local-held:1", { id: "local-held:1" });
    stores.local_cart.set("active", { id: "active", lines: [{ product_code: "A" }] });
    stores.catalog.set("A", { product_code: "A" });
    stores.order_slots.set("legacy-1", { slot_id: "legacy-1", order_num: 1 });
    stores.meta.set("local_held_seq", { key: "local_held_seq", value: 4 });
    stores.outbox.set("synced-1", {
      client_sale_uuid: "synced-1",
      sync_status: "synced",
      order_num: 10,
    });
    stores.outbox.set("pending-1", {
      client_sale_uuid: "pending-1",
      sync_status: "pending",
      order_num: 11,
    });
    stores.outbox.set("syncing-1", {
      client_sale_uuid: "syncing-1",
      sync_status: "syncing",
      sync_started_at_ms: Date.now(),
      order_num: 12,
    });

    const result = await clearPosSessionLocalCache();

    expect(stores.held_parks.size).toBe(0);
    expect(stores.local_cart.size).toBe(0);
    expect(stores.catalog.size).toBe(0);
    expect(stores.order_slots.size).toBe(0);
    expect(stores.meta.size).toBe(0);
    expect(stores.outbox.has("synced-1")).toBe(false);
    expect(stores.outbox.has("pending-1")).toBe(true);
    expect(stores.outbox.get("syncing-1")?.sync_status).toBe("pending");
    expect(result.preservedOutbox).toBe(2);
  });
});
