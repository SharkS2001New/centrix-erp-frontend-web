import { beforeEach, describe, expect, it, vi } from "vitest";

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
  idbGetOutboxSale: vi.fn(async () => null),
  idbPutOutboxSale: vi.fn(async () => {}),
  idbListPendingOutbox: vi.fn(async () => []),
  idbListUnsyncedOutbox: vi.fn(async () => []),
  newClientSaleUuid: () => "uuid-hold-clear",
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
  todayPosOrderDate: () => "2026-08-14",
}));

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

describe("offline hold — local cart clear", () => {
  beforeEach(() => {
    cartStore.clear();
    vi.resetModules();
  });

  it("discards in-flight lined cart writes after hold invalidates them", async () => {
    const {
      saveLocalPosCart,
      invalidateStaleLocalCartWrites,
      clearLocalPosCart,
      emptyLocalPosCart,
      loadOrCreateLocalPosCart,
    } = await import("@/lib/pos-offline");

    await saveLocalPosCart({
      id: "active",
      offline: true,
      lines: [{ product_code: "SUGAR", quantity: 1, unit_price: 100 }],
    });

    const stale = saveLocalPosCart({
      id: "active",
      offline: true,
      lines: [
        { product_code: "SUGAR", quantity: 1, unit_price: 100 },
        { product_code: "RICE", quantity: 2, unit_price: 80 },
      ],
    });

    invalidateStaleLocalCartWrites();
    await clearLocalPosCart();
    await saveLocalPosCart(emptyLocalPosCart({ branch_id: 1, till_id: 1 }));
    await stale;

    const next = await loadOrCreateLocalPosCart({ branch_id: 1, till_id: 1 });
    expect(next.lines ?? []).toEqual([]);
  });
});
