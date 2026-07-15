import { describe, expect, it } from "vitest";
import {
  lpoSessionReceiveAmount,
  lpoSessionReceiveMoney,
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

describe("lpoSessionReceiveMoney", () => {
  const uom = {
    conversion_factor: 1,
    middle_factor: 1,
    small_packaging_label: "pcs",
  };

  it("derives unit cost from amount ÷ receiving qty when all received in one go", () => {
    const line = { id: 3, ordered_qty: 10, received_qty: 0, cost_price: 100 };
    const counts = { "3:small": "15" };
    const money = lpoSessionReceiveMoney(line, uom, counts);
    expect(money.amount).toBe(1000);
    expect(money.unitCost).toBeCloseTo(66.6667, 4);
    expect(money.showOriginal).toBe(true);
    expect(money.originalCost).toBe(100);
  });

  it("shows a single cost when amount ÷ qty equals original price", () => {
    const line = { id: 4, ordered_qty: 10, received_qty: 0, cost_price: 100 };
    const counts = { "4:small": "5" };
    const money = lpoSessionReceiveMoney(line, uom, counts);
    expect(money.amount).toBe(500);
    expect(money.unitCost).toBe(100);
    expect(money.showOriginal).toBe(false);
  });

  it("keeps original cost before any qty is received", () => {
    const line = { id: 5, ordered_qty: 10, received_qty: 0, cost_price: 1565 };
    const money = lpoSessionReceiveMoney(line, uom, {});
    expect(money.amount).toBe(0);
    expect(money.unitCost).toBe(1565);
    expect(money.showOriginal).toBe(false);
  });

  it("reconciles cost from already received when adding late offer", () => {
    // Ordered 9 @ 1565, already 10 (9 paid + 1 offer), receiving 10 more offer
    const line = {
      id: 6,
      ordered_qty: 9,
      received_qty: 10,
      offer_qty: 1,
      cost_price: 1565,
    };
    const counts = { "6:small": "10" };
    const money = lpoSessionReceiveMoney(line, uom, counts);
    expect(money.amount).toBe(0);
    // (9 × 1565) / 20
    expect(money.unitCost).toBeCloseTo(704.25, 4);
    expect(money.showOriginal).toBe(true);
    expect(money.receivedToDate).toBe(20);
    expect(money.paidToDate).toBe(9);
  });

  it("partial then offer ends at the same cost as one-shot receive", () => {
    const linePartial = {
      id: 7,
      ordered_qty: 10,
      received_qty: 6,
      offer_qty: 0,
      cost_price: 100,
    };
    // Receive remaining 4 paid + 5 offer
    const afterPartial = lpoSessionReceiveMoney(linePartial, uom, {
      "7:small": "9",
    });
    expect(afterPartial.amount).toBe(400);
    expect(afterPartial.unitCost).toBeCloseTo(66.6667, 4);

    const oneShot = lpoSessionReceiveMoney(
      { id: 8, ordered_qty: 10, received_qty: 0, cost_price: 100 },
      uom,
      { "8:small": "15" },
    );
    expect(oneShot.unitCost).toBeCloseTo(afterPartial.unitCost, 4);
  });
});
