import { beforeEach, describe, expect, it, vi } from "vitest";

const putCalls = [];
const outboxByUuid = new Map();

vi.mock("@/lib/pos-offline-db", async () => {
  const actual = await vi.importActual("@/lib/pos-offline-db");
  return {
    ...actual,
    idbGetOutboxSale: vi.fn(async (uuid) => outboxByUuid.get(String(uuid)) ?? null),
    idbPutOutboxSale: vi.fn(async (row) => {
      putCalls.push(row);
      outboxByUuid.set(String(row.client_sale_uuid), { ...row });
    }),
    idbListSyncedOutboxForBrowse: vi.fn(async () =>
      [...outboxByUuid.values()].filter(
        (r) => r?.sync_status === "synced" && Number(r.server_sale_id ?? 0) > 0,
      ),
    ),
  };
});

import {
  cacheServerSaleForOfflineEdit,
  findLocalSyncedSaleForOfflineEdit,
  onlineSaleMirrorClientUuid,
  prefetchServerSalesForOfflineEdit,
} from "@/lib/pos-offline";

describe("cacheServerSaleForOfflineEdit", () => {
  beforeEach(() => {
    putCalls.length = 0;
    outboxByUuid.clear();
  });

  it("mirrors an online sale so offline previous-order edit can load it", async () => {
    const sale = {
      id: 42,
      order_num: 9001,
      pos_order_num: 18,
      pos_order_date: "2026-08-08",
      float_session_id: 3,
      payment_method_code: "CASH",
      order_total: 305,
      cash: 305,
      items: [
        {
          product_code: "92003",
          product_name: "KAMANDE LARGE 50KG",
          quantity: 100,
          unit_price: 3.05,
          display_unit_price: 152.5,
          amount: 305,
          on_wholesale_retail: 0,
        },
      ],
    };

    await expect(cacheServerSaleForOfflineEdit(sale)).resolves.toBe(true);
    expect(onlineSaleMirrorClientUuid(42)).toBe("online-mirror-42");
    expect(putCalls[0]?.sync_status).toBe("synced");
    expect(putCalls[0]?.sync_kind).toBe("online_mirror");
    expect(putCalls[0]?.lines).toHaveLength(1);

    const loaded = await findLocalSyncedSaleForOfflineEdit({
      saleId: 42,
      ticketNum: 18,
    });
    expect(loaded?.id).toBe(42);
    expect(loaded?.pos_order_num).toBe(18);
    expect(loaded?.items).toHaveLength(1);
    expect(loaded?.items[0]?.product_code).toBe("92003");
    expect(loaded?.items[0]?.amount).toBe(305);
  });

  it("skips sales without line items", async () => {
    await expect(
      cacheServerSaleForOfflineEdit({ id: 7, order_num: 1, items: [] }),
    ).resolves.toBe(false);
    expect(putCalls).toHaveLength(0);
  });

  it("prefeches missing server receipts via fetchSale", async () => {
    const fetchSale = vi.fn(async (id) => ({
      id,
      order_num: 100 + id,
      pos_order_num: id,
      items: [{ product_code: "A", quantity: 1, unit_price: 10, amount: 10 }],
    }));

    const cached = await prefetchServerSalesForOfflineEdit([{ id: 11 }, { id: 12 }], {
      fetchSale,
      limit: 15,
    });
    expect(cached).toBe(2);
    expect(fetchSale).toHaveBeenCalledTimes(2);
    await expect(findLocalSyncedSaleForOfflineEdit({ saleId: 11 })).resolves.toMatchObject({
      id: 11,
      items: [{ product_code: "A" }],
    });
  });
});
