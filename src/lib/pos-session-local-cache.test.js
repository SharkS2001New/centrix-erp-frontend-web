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

let wipeCalls = 0;
let clearAllCalls = 0;

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

vi.mock("@/lib/pos-offline-db", () => ({
  POS_OFFLINE_OWNER_META_KEY: "pos_device_owner",
  idbGetMeta: async (key) => stores.meta.get(key)?.value ?? null,
  idbSetMeta: async (key, value) => {
    stores.meta.set(key, { key, value });
  },
  idbWipeDatabaseCompletely: async () => {
    wipeCalls += 1;
    for (const store of Object.values(stores)) store.clear();
  },
  idbClearAllStores: async () => {
    clearAllCalls += 1;
    for (const store of Object.values(stores)) store.clear();
  },
}));

describe("clearPosSessionLocalCache", () => {
  beforeEach(() => {
    wipeCalls = 0;
    clearAllCalls = 0;
    for (const store of Object.values(stores)) store.clear();
  });

  it("wipes the entire IndexedDB including pending outbox after Z", async () => {
    const { clearPosSessionLocalCache } = await import("@/lib/pos-session-local-cache");

    stores.held_parks.set("local-held:1", { id: "local-held:1" });
    stores.local_cart.set("active", { id: "active", lines: [{ product_code: "A" }] });
    stores.catalog.set("A", { product_code: "A" });
    stores.order_slots.set("legacy-1", { slot_id: "legacy-1", order_num: 1 });
    stores.meta.set("local_held_seq", { key: "local_held_seq", value: 4 });
    stores.outbox.set("pending-1", {
      client_sale_uuid: "pending-1",
      sync_status: "pending",
      order_num: 11,
    });
    stores.outbox.set("syncing-1", {
      client_sale_uuid: "syncing-1",
      sync_status: "syncing",
      order_num: 12,
    });

    const result = await clearPosSessionLocalCache();

    expect(wipeCalls).toBe(1);
    expect(stores.held_parks.size).toBe(0);
    expect(stores.local_cart.size).toBe(0);
    expect(stores.catalog.size).toBe(0);
    expect(stores.order_slots.size).toBe(0);
    expect(stores.meta.size).toBe(0);
    expect(stores.outbox.size).toBe(0);
    expect(result.wiped).toBe(true);
    expect(result.preservedOutbox).toBe(0);
  });
});

describe("ensurePosOfflineOwnerIsolation", () => {
  beforeEach(() => {
    wipeCalls = 0;
    clearAllCalls = 0;
    for (const store of Object.values(stores)) store.clear();
  });

  it("does not wipe when the same cashier returns", async () => {
    const { ensurePosOfflineOwnerIsolation } = await import("@/lib/pos-session-local-cache");

    stores.meta.set("pos_device_owner", {
      key: "pos_device_owner",
      value: { organization_id: 1, user_id: 9 },
    });
    stores.local_cart.set("active", { id: "active", lines: [{ product_code: "A" }] });

    const result = await ensurePosOfflineOwnerIsolation({
      organizationId: 1,
      userId: 9,
    });

    expect(result.wiped).toBe(false);
    expect(wipeCalls).toBe(0);
    expect(stores.local_cart.size).toBe(1);
  });

  it("wipes completely when a different cashier logs in", async () => {
    const { ensurePosOfflineOwnerIsolation } = await import("@/lib/pos-session-local-cache");

    stores.meta.set("pos_device_owner", {
      key: "pos_device_owner",
      value: { organization_id: 1, user_id: 9 },
    });
    stores.local_cart.set("active", { id: "active", lines: [{ product_code: "A" }] });
    stores.outbox.set("pending-1", {
      client_sale_uuid: "pending-1",
      sync_status: "pending",
    });

    const result = await ensurePosOfflineOwnerIsolation({
      organizationId: 1,
      userId: 42,
    });

    expect(result.wiped).toBe(true);
    expect(wipeCalls).toBe(1);
    expect(stores.local_cart.size).toBe(0);
    expect(stores.outbox.size).toBe(0);
    expect(stores.meta.get("pos_device_owner")?.value).toEqual({
      organization_id: 1,
      user_id: 42,
    });
  });
});
