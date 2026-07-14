import { describe, expect, it } from "vitest";
import { offerAdjustedUnitCost } from "@/components/inventory/lpo-receive-stock";

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
