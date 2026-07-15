import { describe, expect, it } from "vitest";
import {
  lpoSessionReceiveAmount,
  offerAdjustedUnitCost,
} from "@/components/inventory/lpo-receive-stock";

describe("offerAdjustedUnitCost", () => {
  it("averages PO cost across ordered + offer qty", () => {
    expect(
      offerAdjustedUnitCost({
        originalCost: 100,
        paidPackQty: 10,
        receivedPackQty: 15,
      }),
    ).toBeCloseTo(66.6667, 4);
  });

  it("returns null when there is no offer portion", () => {
    expect(
      offerAdjustedUnitCost({
        originalCost: 100,
        paidPackQty: 10,
        receivedPackQty: 10,
      }),
    ).toBeNull();
  });
});

describe("lpoSessionReceiveAmount", () => {
  const uom = {
    conversion_factor: 1,
    middle_factor: 1,
    small_packaging_label: "pcs",
  };

  it("bills paid packs at PO unit cost", () => {
    const line = { id: 1, ordered_qty: 10, received_qty: 0, cost_price: 1565 };
    const counts = {
      "1:small": "3",
    };
    expect(lpoSessionReceiveAmount(line, uom, counts)).toBe(4695);
  });

  it("excludes offer packs from the billable total", () => {
    const line = { id: 2, ordered_qty: 2, received_qty: 0, cost_price: 100 };
    const counts = {
      "2:small": "5",
    };
    // 2 paid × 100 + 3 offer free
    expect(lpoSessionReceiveAmount(line, uom, counts)).toBe(200);
  });
});
