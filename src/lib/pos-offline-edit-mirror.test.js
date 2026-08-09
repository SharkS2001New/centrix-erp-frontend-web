import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pos-offline-db", () => {
  const outbox = new Map();
  const localCart = new Map();
  return {
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
    __outbox: outbox,
    __localCart: localCart,
  };
});

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

import {
  finalizeQueuedOfflineSaleEdit,
  saveLocalPosCart,
  syncOutboxSaleFromLocalEditCart,
} from "@/lib/pos-offline";
import * as db from "@/lib/pos-offline-db";

describe("syncOutboxSaleFromLocalEditCart", () => {
  beforeEach(() => {
    db.__outbox.clear();
    db.__localCart.clear();
  });

  it("mirrors local cart line edits into the pending outbox row", async () => {
    const uuid = "edit-uuid-32";
    await db.idbPutOutboxSale({
      client_sale_uuid: uuid,
      order_num: 32,
      sync_status: "editing",
      content_revision: 1,
      sale_payload: {
        id: `offline:${uuid}`,
        order_num: 32,
        pos_order_num: 32,
        customer_name_override: "TEST",
        order_total: 4120,
        items: [
          {
            product_code: "SUGAR",
            product_name: "SUGAR 50 KG",
            quantity: 2,
            unit_price: 140,
            amount: 280,
          },
          {
            product_code: "COSMO",
            product_name: "COSMO HB 2KG",
            quantity: 2,
            unit_price: 1920,
            amount: 3840,
          },
        ],
        payments: [{ payment_method_code: "CASH", amount: 4120 }],
      },
      lines: [
        { product_code: "SUGAR", quantity: 2, unit_price: 140 },
        { product_code: "COSMO", quantity: 2, unit_price: 1920 },
      ],
      checkout_body: { client_sale_uuid: uuid },
    });

    const cart = {
      id: "active",
      offline: true,
      held_order_num: 32,
      pos_order_num: 32,
      offline_client_sale_uuid: uuid,
      customer_name_override: "TEST",
      lines: [
        {
          client_line_id: "a",
          product_code: "SUGAR",
          product_name: "SUGAR 50 KG",
          quantity: 1,
          unit_price: 140,
          amount: 140,
        },
        {
          client_line_id: "b",
          product_code: "COSMO",
          product_name: "COSMO HB 2KG",
          quantity: 2,
          unit_price: 1920,
          amount: 3840,
        },
      ],
    };

    await saveLocalPosCart(cart);

    const row = await db.idbGetOutboxSale(uuid);
    expect(row.sync_status).toBe("editing");
    expect(row.lines).toHaveLength(2);
    expect(row.lines[0].quantity).toBe(1);
    expect(row.sale_payload.items[0].quantity).toBe(1);
    expect(row.sale_payload.order_total).toBe(3980);
    expect(row.sale_payload.payments?.[0]?.amount).toBe(4120);
    expect(row.content_revision).toBe(2);

    await finalizeQueuedOfflineSaleEdit(cart);
    const finalized = await db.idbGetOutboxSale(uuid);
    expect(finalized.sync_status).toBe("pending");
    expect(finalized.sale_payload.items[0].quantity).toBe(1);
  });

  it("mirrors a swapped product_code into the outbox row", async () => {
    const uuid = "swap-uuid-32";
    await db.idbPutOutboxSale({
      client_sale_uuid: uuid,
      order_num: 32,
      sync_status: "editing",
      content_revision: 1,
      sale_payload: {
        id: `offline:${uuid}`,
        order_num: 32,
        items: [
          {
            product_code: "SUGAR",
            product_name: "SUGAR 50 KG",
            quantity: 2,
            unit_price: 140,
            amount: 280,
          },
        ],
      },
      lines: [{ product_code: "SUGAR", quantity: 2, unit_price: 140 }],
      checkout_body: { client_sale_uuid: uuid },
    });

    await saveLocalPosCart({
      id: "active",
      offline: true,
      held_order_num: 32,
      offline_client_sale_uuid: uuid,
      lines: [
        {
          client_line_id: "a",
          product_code: "COSMO",
          product_name: "COSMO HB 2KG",
          quantity: 1,
          unit_price: 1920,
          amount: 1920,
        },
      ],
    });

    const row = await db.idbGetOutboxSale(uuid);
    expect(row.lines).toHaveLength(1);
    expect(row.lines[0].product_code).toBe("COSMO");
    expect(row.sale_payload.items[0].product_code).toBe("COSMO");
    expect(row.sale_payload.order_total).toBe(1920);
  });

  it("no-ops when outbox row is already syncing", async () => {
    const uuid = "syncing-uuid";
    await db.idbPutOutboxSale({
      client_sale_uuid: uuid,
      sync_status: "syncing",
      content_revision: 1,
      sale_payload: { items: [{ product_code: "A", quantity: 1, unit_price: 10 }] },
      lines: [{ product_code: "A", quantity: 1, unit_price: 10 }],
    });
    const result = await syncOutboxSaleFromLocalEditCart({
      offline_client_sale_uuid: uuid,
      lines: [{ product_code: "A", quantity: 9, unit_price: 10 }],
    });
    expect(result).toBeNull();
    const row = await db.idbGetOutboxSale(uuid);
    expect(row.lines[0].quantity).toBe(1);
  });
});
