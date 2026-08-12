/**
 * Regression test: when offline, a completed sale's lines must not appear on the
 * next sale's cart (the "ghost item / sugar" bug).
 *
 * Root cause: queueOfflineSale writes the outbox inside an exclusive lock and then
 * calls clearLocalPosCart(). But loadOrCreateLocalPosCart is NOT inside the lock —
 * it can race with clearLocalPosCart and find the stale IDB cart (with the old
 * sale's lines) before the clear happens.
 *
 * Fix: loadOrCreateLocalPosCart now compares the existing offline cart's product
 * codes against every pending/syncing outbox row. If the cart's lines are already
 * captured in an outbox sale, the cart is treated as stale and wiped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const outboxStore = new Map();
const cartStore = new Map();

vi.mock("@/lib/pos-offline-db", () => ({
  idbPutLocalCart: vi.fn(async (cart) => {
    cartStore.set(String(cart.id ?? "active"), structuredClone(cart));
  }),
  idbGetLocalCart: vi.fn(async (id = "active") => {
    const row = cartStore.get(String(id));
    return row ? structuredClone(row) : null;
  }),
  idbClearLocalCart: vi.fn(async (id = "active") => {
    cartStore.delete(String(id));
  }),
  idbGetOutboxSale: vi.fn(async (uuid) => {
    const row = outboxStore.get(String(uuid));
    return row ? structuredClone(row) : null;
  }),
  idbPutOutboxSale: vi.fn(async (row) => {
    outboxStore.set(String(row.client_sale_uuid), structuredClone(row));
  }),
  idbListPendingOutbox: vi.fn(async ({ includeErrors = true } = {}) => {
    return [...outboxStore.values()].filter((r) => {
      if (r.sync_status === "pending") return true;
      if (includeErrors && r.sync_status === "error") return true;
      return false;
    });
  }),
  idbListUnsyncedOutbox: vi.fn(async () => {
    return [...outboxStore.values()].filter((r) => {
      const s = r.sync_status ?? "";
      return s === "pending" || s === "error" || s === "editing" || s === "syncing";
    });
  }),
  newClientSaleUuid: () => "uuid-ghost-test",
  idbGetCatalogProduct: async () => null,
  withPosOfflineExclusiveLock: async (fn) => fn(),
  idbListSyncedOutboxForBrowse: async () => [],
  idbFindSyncedServerSaleIdByPosTicket: async () => null,
  idbCountPendingOutbox: async () => 0,
  idbCountAutoRetryOutbox: async () => 0,
  idbListEditableOutbox: async () => [],
  idbListOrderSlots: async () => [],
  idbGetMeta: async () => null,
  clampPosOrderBusinessDate: (d) => d,
  normalizePosOrderDate: (d) => d,
  todayPosOrderDate: () => "2026-08-12",
}));

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

describe("loadOrCreateLocalPosCart — ghost line prevention", () => {
  beforeEach(() => {
    outboxStore.clear();
    cartStore.clear();
    vi.resetModules();
  });

  it("wipes a plain offline cart whose lines are already captured in a pending outbox sale", async () => {
    // Simulate: Sale A checked out offline (two items). The outbox row was written
    // but clearLocalPosCart() has not run yet (race window inside exclusive lock).
    outboxStore.set("sale-a-uuid", {
      client_sale_uuid: "sale-a-uuid",
      sync_status: "pending",
      sale_payload: {
        items: [
          { product_code: "MAIZE", quantity: 5, unit_price: 60 },
          { product_code: "WHEAT", quantity: 2, unit_price: 120 },
        ],
      },
    });
    // The stale local cart still has both items (clearLocalPosCart hasn't run yet).
    cartStore.set("active", {
      id: "active",
      offline: true,
      // NO offline_client_sale_uuid — plain new-sale cart, not a queued edit
      lines: [
        { product_code: "MAIZE", quantity: 5, unit_price: 60, client_line_id: "c1" },
        { product_code: "WHEAT", quantity: 2, unit_price: 120, client_line_id: "c2" },
      ],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({ branch_id: 1, till_id: 2, float_session_id: 10 });

    expect(next.lines ?? []).toHaveLength(0);
    expect(next.offline_client_sale_uuid).toBeUndefined();
  });

  it("wipes a stale cart even when only a subset of outbox items matches all cart lines", async () => {
    // Outbox has 3 items; cart only has 2 of them — those 2 are already queued.
    outboxStore.set("sale-b-uuid", {
      client_sale_uuid: "sale-b-uuid",
      sync_status: "pending",
      sale_payload: {
        items: [
          { product_code: "SUGAR", quantity: 1, unit_price: 140 },
          { product_code: "FLOUR", quantity: 3, unit_price: 70 },
          { product_code: "OIL",   quantity: 2, unit_price: 200 },
        ],
      },
    });
    cartStore.set("active", {
      id: "active",
      offline: true,
      lines: [
        { product_code: "SUGAR", quantity: 1, unit_price: 140, client_line_id: "c1" },
        { product_code: "FLOUR", quantity: 3, unit_price: 70,  client_line_id: "c2" },
      ],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({ branch_id: 1 });

    expect(next.lines ?? []).toHaveLength(0);
  });

  it("preserves a fresh cart whose lines do NOT appear in any outbox sale", async () => {
    // Outbox has a sale for SUGAR; the live cart is selling a completely different product.
    outboxStore.set("sale-c-uuid", {
      client_sale_uuid: "sale-c-uuid",
      sync_status: "pending",
      sale_payload: {
        items: [{ product_code: "SUGAR", quantity: 1, unit_price: 140 }],
      },
    });
    cartStore.set("active", {
      id: "active",
      offline: true,
      lines: [
        { product_code: "RICE", quantity: 10, unit_price: 90, client_line_id: "c1" },
      ],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({ branch_id: 1 });

    // RICE is NOT in the SUGAR outbox — cart should be preserved.
    expect(next.lines ?? []).toHaveLength(1);
    expect(next.lines[0].product_code).toBe("RICE");
  });

  it("preserves a cart with an active editing outbox (offline queued-edit session)", async () => {
    const uuid = "edit-uuid-1";
    outboxStore.set(uuid, {
      client_sale_uuid: uuid,
      sync_status: "editing",
      sale_payload: {
        items: [{ product_code: "MAIZE", quantity: 5, unit_price: 60 }],
      },
    });
    cartStore.set("active", {
      id: "active",
      offline: true,
      offline_client_sale_uuid: uuid,
      lines: [{ product_code: "MAIZE", quantity: 5, unit_price: 60, client_line_id: "c1" }],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({ branch_id: 1 });

    // `editing` status = active edit session — keep the cart.
    expect(next.offline_client_sale_uuid).toBe(uuid);
    expect(next.lines ?? []).toHaveLength(1);
  });

  it("handles an empty local cart gracefully even when outbox has pending rows", async () => {
    outboxStore.set("sale-d-uuid", {
      client_sale_uuid: "sale-d-uuid",
      sync_status: "pending",
      sale_payload: {
        items: [{ product_code: "TEA", quantity: 2, unit_price: 50 }],
      },
    });
    // Cart has no lines at all.
    cartStore.set("active", {
      id: "active",
      offline: true,
      lines: [],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({ branch_id: 1 });

    // An empty cart is fine — nothing to clear.
    expect(next.lines ?? []).toHaveLength(0);
  });
});
