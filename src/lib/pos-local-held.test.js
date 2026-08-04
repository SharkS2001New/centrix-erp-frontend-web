import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pos-offline-db", () => {
  /** @type {Map<string, any>} */
  const parks = new Map();
  let seq = 0;
  /** @type {Map<string, any>} */
  const meta = new Map();

  return {
    newClientSaleUuid: () => `uuid-${++seq}`,
    idbGetMeta: async (key) => meta.get(key) ?? null,
    idbSetMeta: async (key, value) => {
      meta.set(key, value);
    },
    idbPutHeldPark: async (park) => {
      parks.set(String(park.id), park);
      return park;
    },
    idbGetHeldPark: async (id) => parks.get(String(id)) ?? null,
    idbDeleteHeldPark: async (id) => parks.delete(String(id)),
    idbListHeldParks: async () =>
      [...parks.values()].sort(
        (a, b) => Number(b.created_at_ms ?? 0) - Number(a.created_at_ms ?? 0),
      ),
    idbCountHeldParks: async () => parks.size,
    __resetLocalHeldMock() {
      parks.clear();
      meta.clear();
      seq = 0;
    },
  };
});

import * as offlineDb from "@/lib/pos-offline-db";
import {
  formatLocalHoldLabel,
  isLocalHeldId,
  localCartFromHeldPark,
  parkCartLocally,
  restoreLocalHeldOrder,
} from "@/lib/pos-local-held";

describe("pos-local-held", () => {
  beforeEach(() => {
    offlineDb.__resetLocalHeldMock();
  });

  it("formats hold labels without sale order numbers", () => {
    expect(formatLocalHoldLabel(1)).toBe("HOLD-1");
    expect(formatLocalHoldLabel(12)).toBe("HOLD-12");
    expect(isLocalHeldId("local-held:abc")).toBe(true);
    expect(isLocalHeldId(99)).toBe(false);
  });

  it("parks a cart locally without consuming order_num", async () => {
    const park = await parkCartLocally(
      {
        lines: [
          {
            product_code: "RICE",
            product_name: "Rice",
            quantity: 2,
            unit_price: 100,
            on_wholesale_retail: 0,
          },
        ],
        branch_id: 1,
      },
      { walkIn: true, walkInName: "Walk-in" },
    );

    expect(park.local_held).toBe(true);
    expect(park.hold_label).toBe("HOLD-1");
    expect(park.order_num).toBeNull();
    expect(park.order_total).toBe(200);
    expect(park.items).toHaveLength(1);
    expect(isLocalHeldId(park.id)).toBe(true);
  });

  it("restores a park into a new local cart and deletes the park", async () => {
    const park = await parkCartLocally(
      {
        lines: [
          {
            product_code: "SUGAR",
            quantity: 1,
            unit_price: 50,
            on_wholesale_retail: 1,
          },
        ],
      },
      { walkIn: true },
    );

    const { cart, park: restoredPark } = await restoreLocalHeldOrder(park.id);
    expect(restoredPark.hold_label).toBe("HOLD-1");
    expect(cart.offline).toBe(true);
    expect(cart.held_order_num).toBeNull();
    expect(cart.superseded_sale_id).toBeNull();
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].product_code).toBe("SUGAR");

    await expect(restoreLocalHeldOrder(park.id)).rejects.toThrow(/not found/i);
  });

  it("builds a cart from park without previous-order edit markers", () => {
    const cart = localCartFromHeldPark({
      id: "local-held:x",
      hold_label: "HOLD-3",
      customer_name: "Jane",
      customer_num: 7,
      items: [{ product_code: "A", quantity: 3, unit_price: 10 }],
      cart_snapshot: { order_discount: 5 },
    });
    expect(cart.customer_name_override).toBe("Jane");
    expect(cart.customer_num).toBe(7);
    expect(cart.order_discount).toBe(5);
    expect(cart.held_order_num).toBeNull();
    expect(cart.restored_from_hold_label).toBe("HOLD-3");
  });
});
