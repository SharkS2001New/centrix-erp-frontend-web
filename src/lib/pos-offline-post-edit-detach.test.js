import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox = new Map();
const localCart = new Map();

vi.mock("@/lib/pos-offline-db", () => ({
  idbPutOutboxSale: vi.fn(async (row) => {
    outbox.set(String(row.client_sale_uuid), structuredClone(row));
  }),
  idbGetOutboxSale: vi.fn(async (uuid) => {
    const row = outbox.get(String(uuid));
    return row ? structuredClone(row) : null;
  }),
  idbPutLocalCart: vi.fn(async (cart) => {
    localCart.set(String(cart.id ?? "active"), structuredClone(cart));
  }),
  idbGetLocalCart: vi.fn(async (id = "active") => {
    const row = localCart.get(String(id));
    return row ? structuredClone(row) : null;
  }),
  idbClearLocalCart: vi.fn(async (id = "active") => {
    localCart.delete(String(id));
  }),
  newClientSaleUuid: () => "uuid-test",
  idbGetCatalogProduct: async () => null,
  withPosOfflineExclusiveLock: async (fn) => fn(),
  idbListSyncedOutboxForBrowse: async () => [],
  idbFindSyncedServerSaleIdByPosTicket: async () => null,
  idbCountPendingOutbox: async () => 0,
  idbCountAutoRetryOutbox: async () => 0,
  idbListPendingOutbox: async () => [],
  idbListEditableOutbox: async () => [],
  clampPosOrderBusinessDate: (d) => d,
  normalizePosOrderDate: (d) => d,
  todayPosOrderDate: () => "2026-08-09",
}));

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

describe("loadOrCreateLocalPosCart after offline edit checkout", () => {
  beforeEach(() => {
    outbox.clear();
    localCart.clear();
    vi.resetModules();
  });

  it("does not restore a stale edit cart when the outbox row is pending", async () => {
    const uuid = "sale-pending-1";
    outbox.set(uuid, {
      client_sale_uuid: uuid,
      sync_status: "pending",
      order_num: 12,
      lines: [{ product_code: "SUGAR", quantity: 2, unit_price: 140 }],
      sale_payload: { order_num: 12, items: [{ product_code: "SUGAR", quantity: 2, unit_price: 140 }] },
    });
    localCart.set("active", {
      id: "active",
      offline: true,
      held_order_num: 12,
      offline_client_sale_uuid: uuid,
      lines: [
        { product_code: "SUGAR", quantity: 2, unit_price: 140 },
        { product_code: "COSMO", quantity: 1, unit_price: 1920 },
      ],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({
      branch_id: 1,
      till_id: 2,
      float_session_id: 99,
    });

    expect(next.offline_client_sale_uuid).toBeUndefined();
    expect(next.lines ?? []).toHaveLength(0);
    expect(next.offline).toBe(true);
    const stored = localCart.get("active");
    expect(stored?.offline_client_sale_uuid).toBeUndefined();
    expect(stored?.lines ?? []).toHaveLength(0);
  });

  it("keeps the local cart while the outbox row is still editing", async () => {
    const uuid = "sale-editing-1";
    outbox.set(uuid, {
      client_sale_uuid: uuid,
      sync_status: "editing",
      order_num: 8,
      lines: [{ product_code: "A", quantity: 1, unit_price: 10 }],
    });
    localCart.set("active", {
      id: "active",
      offline: true,
      held_order_num: 8,
      offline_client_sale_uuid: uuid,
      lines: [{ product_code: "A", quantity: 2, unit_price: 10 }],
    });

    const { loadOrCreateLocalPosCart } = await import("@/lib/pos-offline");
    const next = await loadOrCreateLocalPosCart({ branch_id: 1 });

    expect(next.offline_client_sale_uuid).toBe(uuid);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].quantity).toBe(2);
  });
});
