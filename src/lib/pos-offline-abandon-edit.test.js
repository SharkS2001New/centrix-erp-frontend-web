import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox = new Map();
const putSpy = vi.fn(async (row) => {
  outbox.set(String(row.client_sale_uuid), row);
});

vi.mock("@/lib/pos-offline-db", () => ({
  idbGetOutboxSale: async (uuid) => outbox.get(String(uuid)) ?? null,
  idbPutOutboxSale: (row) => putSpy(row),
  idbGetLocalCart: async () => null,
  idbPutLocalCart: async () => {},
  idbClearLocalCart: async () => {},
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

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (e) => String(e?.message ?? e),
}));

describe("abandonOfflineSaleEdit", () => {
  beforeEach(() => {
    outbox.clear();
    putSpy.mockClear();
    vi.resetModules();
  });

  it("keeps outbox lines when leaving an offline edit (does not spread sale snapshot)", async () => {
    outbox.set("sale-1", {
      client_sale_uuid: "sale-1",
      sync_status: "editing",
      sync_kind: "sale",
      order_num: 12,
      lines: [
        {
          product_code: "YABAL",
          quantity: 5,
          unit_price: 100,
          product_name: "Yabal",
        },
      ],
      sale_payload: {
        client_sale_uuid: "sale-1",
        order_num: 12,
        items: [
          {
            product_code: "YABAL",
            quantity: 5,
            unit_price: 100,
            product_name: "Yabal",
          },
        ],
      },
      checkout_body: { offline_order: true },
      cart_seed: { channel: "pos" },
    });

    const { abandonOfflineSaleEdit } = await import("@/lib/pos-offline");
    await abandonOfflineSaleEdit({
      offline_client_sale_uuid: "sale-1",
      offline_edit_snapshot: {
        client_sale_uuid: "sale-1",
        order_num: 12,
        items: [
          {
            product_code: "YABAL",
            quantity: 5,
            unit_price: 100,
          },
        ],
      },
      lines: [],
    });

    const saved = outbox.get("sale-1");
    expect(saved.sync_status).toBe("pending");
    expect(saved.lines).toHaveLength(1);
    expect(saved.lines[0].product_code).toBe("YABAL");
    expect(saved.sale_payload?.items).toHaveLength(1);
    expect(saved.checkout_body).toEqual({ offline_order: true });
  });

  it("repairs a corrupted outbox row that only has top-level items", async () => {
    // Shape left by the old bug: sale snapshot written over the outbox record.
    outbox.set("sale-2", {
      client_sale_uuid: "sale-2",
      sync_status: "editing",
      order_num: 3,
      items: [
        {
          product_code: "SUGAR",
          quantity: 2,
          unit_price: 50,
          product_name: "Sugar",
        },
      ],
    });

    const { abandonOfflineSaleEdit } = await import("@/lib/pos-offline");
    await abandonOfflineSaleEdit({
      offline_client_sale_uuid: "sale-2",
      offline_edit_snapshot: {
        client_sale_uuid: "sale-2",
        items: [
          {
            product_code: "SUGAR",
            quantity: 2,
            unit_price: 50,
          },
        ],
      },
    });

    const saved = outbox.get("sale-2");
    expect(saved.sync_status).toBe("pending");
    expect(saved.lines?.length).toBe(1);
    expect(saved.lines[0].product_code).toBe("SUGAR");
    expect(saved.sale_payload?.items?.length).toBe(1);
  });
});
