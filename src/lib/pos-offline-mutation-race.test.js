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
  newClientSaleUuid: () => "uuid-mutation-race",
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

describe("local cart mutation race", () => {
  beforeEach(() => {
    cartStore.clear();
    vi.resetModules();
  });

  it("does not resurrect a deleted line when an older add finishes later", async () => {
    const { saveLocalPosCart, withLocalCartMutation, awaitLocalCartWrites } =
      await import("@/lib/pos-offline");
    const { idbGetLocalCart } = await import("@/lib/pos-offline-db");

    const three = withLocalCartMutation({
      id: "active",
      offline: true,
      lines: [
        { client_line_id: "a", product_code: "A", quantity: 1, unit_price: 10 },
        { client_line_id: "b", product_code: "B", quantity: 1, unit_price: 20 },
        { client_line_id: "c", product_code: "C", quantity: 1, unit_price: 30 },
      ],
    });
    const staleAdd = saveLocalPosCart(three);

    const two = withLocalCartMutation({
      id: "active",
      offline: true,
      lines: [
        { client_line_id: "a", product_code: "A", quantity: 1, unit_price: 10 },
        { client_line_id: "b", product_code: "B", quantity: 1, unit_price: 20 },
      ],
    });
    await saveLocalPosCart(two);
    await staleAdd;
    await awaitLocalCartWrites();

    const stored = await idbGetLocalCart("active");
    expect((stored?.lines ?? []).map((l) => l.product_code)).toEqual(["A", "B"]);
  });

  it("keeps the newer qty when an older snapshot save is still queued", async () => {
    const { saveLocalPosCart, withLocalCartMutation, awaitLocalCartWrites } =
      await import("@/lib/pos-offline");
    const { idbGetLocalCart } = await import("@/lib/pos-offline-db");

    const qty1 = withLocalCartMutation({
      id: "active",
      offline: true,
      lines: [{ client_line_id: "a", product_code: "A", quantity: 1, unit_price: 10 }],
    });
    const stale = saveLocalPosCart(qty1);

    const qty5 = withLocalCartMutation({
      id: "active",
      offline: true,
      lines: [{ client_line_id: "a", product_code: "A", quantity: 5, unit_price: 10 }],
    });
    await saveLocalPosCart(qty5);
    await stale;
    await awaitLocalCartWrites();

    const stored = await idbGetLocalCart("active");
    expect(Number(stored?.lines?.[0]?.quantity)).toBe(5);
  });

  it("converts sole kg line to bag in place instead of appending a twin", async () => {
    const { upsertLocalPosCartLine, withLocalCartMutation, awaitLocalCartWrites } =
      await import("@/lib/pos-offline");
    const { idbGetLocalCart } = await import("@/lib/pos-offline-db");

    await upsertLocalPosCartLine(
      withLocalCartMutation({
        id: "active",
        offline: true,
        lines: [
          {
            client_line_id: "polished-1",
            product_code: "1261001",
            product_name: "POLISHED 90KG",
            quantity: 1,
            unit_price: 100,
            on_wholesale_retail: 1,
            uom: "kg",
          },
        ],
      }),
      {
        product_code: "1261001",
        product_name: "POLISHED 90KG",
        quantity: 90,
        unit_price: 8800 / 90,
        amount: 8800,
        on_wholesale_retail: 0,
        uom: "Bags(90)",
      },
      { combineIdenticalLines: true },
    );
    await awaitLocalCartWrites();

    const stored = await idbGetLocalCart("active");
    const polished = (stored?.lines ?? []).filter((l) => l.product_code === "1261001");
    expect(polished).toHaveLength(1);
    expect(Number(polished[0].on_wholesale_retail)).toBe(0);
    expect(String(polished[0].client_line_id)).toBe("polished-1");
    expect(Number(polished[0].quantity)).toBe(90);
  });
});
