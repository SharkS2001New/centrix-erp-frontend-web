import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pos-offline-db", async (importOriginal) => {
  const actual = await importOriginal();
  /** @type {Map<string, any>} */
  const carts = new Map();
  let seq = 0;
  return {
    ...actual,
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

  it("keeps previous-order edit markers so Payment Breakdown still opens offline", async () => {
    const open = {
      id: 88,
      channel: "pos",
      held_order_num: 12,
      superseded_sale_id: 501,
      original_order_total: 5000,
      _editDraftDirty: true,
      payment_method_code: "MPESA",
      payment_adjustments: [
        { adjustment_type: "topup", method_code: "CASH", amount: 500, provisional: true },
      ],
      lines: [
        {
          id: 1,
          update_code: "L1",
          product_code: "P1",
          quantity: 1,
          unit_price: 5500,
          amount: 5500,
          on_wholesale_retail: 0,
        },
      ],
    };

    const local = await continueOpenCartThroughOutage(open, { branch_id: 1 });
    expect(local.offline).toBe(true);
    expect(local.held_order_num).toBe(12);
    expect(local.superseded_sale_id).toBe(501);
    expect(local.original_order_total).toBe(5000);
    expect(local._editDraftDirty).toBe(true);
    expect(local.payment_method_code).toBe("MPESA");
    expect(local.payment_adjustments).toEqual([
      { adjustment_type: "topup", method_code: "CASH", amount: 500, provisional: true },
    ]);
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

  it("keeps separate local lines when combine identical products is off", async () => {
    let cart = {
      id: "active",
      offline: true,
      lines: [],
    };
    cart = await upsertLocalPosCartLine(
      cart,
      {
        product_code: "BANJAB",
        quantity: 1,
        unit_price: 2000,
        amount: 3600,
        on_wholesale_retail: false,
        client_line_id: "c1",
      },
      { combineIdenticalLines: false },
    );
    cart = await upsertLocalPosCartLine(
      cart,
      {
        product_code: "BANJAB",
        quantity: 1,
        unit_price: 2000,
        amount: 3600,
        on_wholesale_retail: false,
        client_line_id: "c2",
      },
      { combineIdenticalLines: false },
    );
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines.map((l) => l.client_line_id)).toEqual(["c1", "c2"]);
  });

  it("still updates the same client_line_id when combine is off", async () => {
    let cart = {
      id: "active",
      offline: true,
      lines: [],
    };
    cart = await upsertLocalPosCartLine(
      cart,
      {
        product_code: "BANJAB",
        quantity: 1,
        unit_price: 2000,
        amount: 3600,
        on_wholesale_retail: false,
        client_line_id: "c1",
      },
      { combineIdenticalLines: false },
    );
    cart = await upsertLocalPosCartLine(
      cart,
      {
        product_code: "BANJAB",
        quantity: 3,
        unit_price: 2000,
        amount: 10800,
        on_wholesale_retail: false,
        client_line_id: "c1",
      },
      { combineIdenticalLines: false },
    );
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(3);
  });

  it("does not collapse duplicate SKUs on outage when combine is off", async () => {
    const open = {
      id: 55,
      channel: "pos",
      lines: [
        {
          id: 1,
          update_code: "A",
          product_code: "YABAL",
          quantity: 1,
          unit_price: 100,
          amount: 100,
          on_wholesale_retail: 0,
        },
        {
          id: 2,
          update_code: "B",
          product_code: "YABAL",
          quantity: 1,
          unit_price: 100,
          amount: 100,
          on_wholesale_retail: 0,
        },
      ],
    };
    const local = await continueOpenCartThroughOutage(open, {
      branch_id: 1,
      combineIdenticalLines: false,
    });
    expect(local.lines).toHaveLength(2);
  });

  it("preserves next_pos_order_num from the open cart through an outage", async () => {
    const open = {
      id: 88,
      channel: "pos",
      next_pos_order_num: 32,
      next_pos_order_date: "2026-08-08",
      lines: [
        {
          id: 1,
          update_code: "L1",
          product_code: "P1",
          quantity: 1,
          unit_price: 10,
          amount: 10,
          on_wholesale_retail: 0,
        },
      ],
    };
    const local = await continueOpenCartThroughOutage(open, { branch_id: 1 });
    expect(local.next_pos_order_num).toBe(32);
    expect(local.next_pos_order_date).toBe("2026-08-08");
  });

  it("accepts next_pos_order_num from the seed when the TemporaryCart lacks it", async () => {
    const open = {
      id: 89,
      channel: "pos",
      lines: [
        {
          id: 1,
          update_code: "L1",
          product_code: "P1",
          quantity: 1,
          unit_price: 10,
          amount: 10,
          on_wholesale_retail: 0,
        },
      ],
    };
    const local = await continueOpenCartThroughOutage(open, {
      branch_id: 1,
      next_pos_order_num: 32,
      next_pos_order_date: "2026-08-08",
    });
    expect(local.next_pos_order_num).toBe(32);
  });
});
