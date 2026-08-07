import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pos-offline-db", () => {
  /** @type {Map<string, any>} */
  const carts = new Map();
  let seq = 0;
  return {
    newClientSaleUuid: () => `uuid-${++seq}`,
    idbPutLocalCart: async (cart) => {
      carts.set(String(cart.id), cart);
      return cart;
    },
    idbGetLocalCart: async (id) => carts.get(String(id)) ?? null,
    idbClearLocalCart: async (id) => carts.delete(String(id)),
    __reset() {
      carts.clear();
      seq = 0;
    },
  };
});

vi.mock("@/lib/sale-line-items", () => ({
  snapshotUomForPrint: () => null,
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import * as offlineDb from "@/lib/pos-offline-db";
import {
  continueOpenCartThroughOutage,
  upsertLocalPosCartLine,
} from "@/lib/pos-offline";

describe("continueOpenCartThroughOutage", () => {
  beforeEach(() => {
    offlineDb.__reset();
  });

  it("keeps workspace line amounts and ids without regenerating duplicates", async () => {
    const open = {
      id: 42,
      channel: "pos",
      lines: [
        {
          id: 1,
          update_code: "CLU-A",
          product_code: "P1",
          product_name: "One",
          quantity: 2,
          unit_price: 100,
          amount: 200,
          uom: "Bag",
          on_wholesale_retail: 0,
        },
        {
          id: 2,
          update_code: "CLU-B",
          product_code: "P2",
          quantity: 1,
          unit_price: 50,
          amount: 3600,
          on_wholesale_retail: 0,
        },
      ],
    };

    const local = await continueOpenCartThroughOutage(open, { branch_id: 1 });
    expect(local.offline).toBe(true);
    expect(local.migrated_from_online_cart_id).toBe(42);
    expect(local.lines).toHaveLength(2);
    expect(local.lines[0].client_line_id).toBe("CLU-A");
    expect(local.lines[1].amount).toBe(3600);
  });

  it("is idempotent when cart is already offline", async () => {
    const first = await continueOpenCartThroughOutage({
      id: 9,
      lines: [{ id: "x", product_code: "A", quantity: 1, unit_price: 10, amount: 10 }],
    });
    const second = await continueOpenCartThroughOutage(first);
    expect(second).toBe(first);
    expect(second.lines).toHaveLength(1);
  });

  it("collapses duplicate optimistic rows for the same SKU when continuing offline", async () => {
    const open = {
      id: 77,
      channel: "pos",
      lines: Array.from({ length: 10 }, (_, i) => ({
        id: `pending-${i}`,
        update_code: `pending-${i}`,
        product_code: "YABAL",
        product_name: "Yabal 2 bag",
        quantity: 1,
        unit_price: 100,
        amount: 100,
        on_wholesale_retail: 0,
        _optimistic: true,
      })),
    };

    const local = await continueOpenCartThroughOutage(open, { branch_id: 1 });
    expect(local.lines).toHaveLength(1);
    expect(local.lines[0].product_code).toBe("YABAL");
    expect(local.lines[0].quantity).toBe(10);
    expect(local.lines[0].amount).toBe(1000);
  });

  it("merges repeat scans of the same SKU into one local line", async () => {
    let cart = {
      id: "active",
      offline: true,
      lines: [],
    };
    cart = await upsertLocalPosCartLine(cart, {
      product_code: "BANJAB",
      quantity: 1,
      unit_price: 2000,
      amount: 3600,
      uom: "Bag",
      on_wholesale_retail: false,
      client_line_id: "c1",
    });
    cart = await upsertLocalPosCartLine(cart, {
      product_code: "BANJAB",
      quantity: 2,
      unit_price: 2000,
      amount: 7200,
      uom: "Piece",
      on_wholesale_retail: false,
      client_line_id: "c2",
    });
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(2);
    expect(cart.lines[0].amount).toBe(7200);
  });
});
