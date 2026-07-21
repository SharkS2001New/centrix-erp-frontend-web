import { describe, expect, it } from "vitest";
import {
  lpoLineDisplayAmount,
  lpoReceiveSessionTotal,
  lpoSessionLineAmount,
  lpoSessionReceivedPackQty,
  lpoSessionReceiveAmount,
  offerAdjustedUnitCost,
  resolveLineUnitCost,
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

describe("lpoLineDisplayAmount", () => {
  const uom = {
    conversion_factor: 1,
    middle_factor: 1,
    small_packaging_label: "pcs",
  };

  it("shows cumulative received + receiving qty × cost while receiving", () => {
    const line = { id: 1, ordered_qty: 50, received_qty: 31, cost_price: 391 };
    const counts = { "1:small": "20" };
    expect(lpoLineDisplayAmount(line, uom, counts, 391)).toBe(19941);
  });

  it("shows received × cost when the line is fully received and nothing is entering now", () => {
    const line = { id: 2, ordered_qty: 200, received_qty: 204, offer_qty: 4, cost_price: 490 };
    expect(lpoLineDisplayAmount(line, uom, {}, 490)).toBe(99960);
  });

  it("shows received × cost for partial lines with nothing receiving now", () => {
    const line = { id: 3, ordered_qty: 120, received_qty: 80, cost_price: 843 };
    expect(lpoLineDisplayAmount(line, uom, {}, 843)).toBe(67440);
  });
});

describe("lpoSessionLineAmount — total = all qty × cost", () => {
  const uom = {
    conversion_factor: 1,
    middle_factor: 1,
    small_packaging_label: "pcs",
  };

  it("bills ALL received packs at the entered unit cost", () => {
    const line = { id: 1, ordered_qty: 10, received_qty: 0, cost_price: 1565 };
    const counts = { "1:small": "3" };
    // 3 qty × 1565 = 4695
    expect(lpoSessionLineAmount(line, uom, counts, 1565)).toBe(4695);
  });

  it("includes offer packs in the total (supplier invoiced full qty)", () => {
    const line = { id: 2, ordered_qty: 2, received_qty: 0, cost_price: 100 };
    const counts = { "2:small": "5" };
    // 5 qty × 100 = 500 (not 200 like before)
    expect(lpoSessionLineAmount(line, uom, counts, 100)).toBe(500);
  });

  it("uses edited unit cost when provided", () => {
    const line = { id: 3, ordered_qty: 10, received_qty: 0, cost_price: 100 };
    const counts = { "3:small": "2" };
    // 2 × 480.39 = 960.78
    expect(lpoSessionLineAmount(line, uom, counts, 480.39)).toBeCloseTo(960.78, 2);
  });
});

describe("lpoSessionReceivedPackQty", () => {
  const uom = {
    conversion_factor: 1,
    middle_factor: 1,
    small_packaging_label: "pcs",
  };

  it("returns total received qty (no offer exclusion)", () => {
    const line = { id: 4, ordered_qty: 2, received_qty: 0, cost_price: 100 };
    expect(lpoSessionReceivedPackQty(line, uom, { "4:small": "5" })).toBe(5);
  });
});

describe("lpoReceiveSessionTotal", () => {
  const uomById = new Map([
    [
      1,
      {
        id: 1,
        conversion_factor: 1,
        middle_factor: 1,
        small_packaging_label: "pcs",
      },
    ],
  ]);

  it("sums all qty × cost for each line", () => {
    const lines = [
      { id: 10, unit_id: 1, ordered_qty: 5, received_qty: 0, cost_price: 100 },
      { id: 11, unit_id: 1, ordered_qty: 5, received_qty: 0, cost_price: 50 },
    ];
    const counts = { "10:small": "2", "11:small": "1" };
    const costs = { 10: "100", 11: "50" };
    // (2 × 100) + (1 × 50) = 250
    expect(lpoReceiveSessionTotal(lines, uomById, counts, costs)).toBe(250);
  });
});

describe("resolveLineUnitCost", () => {
  it("prefers edited cost over PO line cost", () => {
    const line = { id: 1, cost_price: 490 };
    expect(resolveLineUnitCost(line, { 1: "480.39" })).toBe(480.39);
    expect(resolveLineUnitCost(line, {})).toBe(490);
  });
});
