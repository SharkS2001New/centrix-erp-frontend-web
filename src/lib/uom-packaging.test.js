import { describe, expect, it } from "vitest";
import { uomIsLiquidMeasure } from "@/lib/uom-packaging";

describe("uomIsLiquidMeasure", () => {
  it("accepts liquid base labels and rejects count and weight labels", () => {
    expect(
      uomIsLiquidMeasure({
        uom_type: "bottle",
        small_packaging_label: "ml",
        conversion_factor: 150,
      }),
    ).toBe(true);
    expect(
      uomIsLiquidMeasure({
        uom_type: "l",
        small_packaging_label: "litres",
        conversion_factor: 10,
      }),
    ).toBe(true);
    expect(
      uomIsLiquidMeasure({
        uom_type: "bag",
        small_packaging_label: "kg",
        conversion_factor: 50,
      }),
    ).toBe(false);
  });
});
