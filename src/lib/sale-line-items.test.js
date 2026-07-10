import { describe, expect, it } from "vitest";
import {
  saleLineDiscountTotalFromEntered,
  saleLineEnteredDiscountPerUnit,
} from "@/lib/sale-line-items";

describe("sale line discount display qty", () => {
  const uomById = new Map([
    [
      1,
      {
        id: 1,
        conversion_factor: 25,
        full_package_label: "BAG",
        small_packaging_label: "KG",
      },
    ],
  ]);

  const line = {
    product_code: "RICE25",
    quantity: 25,
    discount_given: 14,
    on_wholesale_retail: 0,
    product: {
      unit_id: 1,
      unit: uomById.get(1),
    },
  };

  it("shows the cashier-entered per-pack discount, not total ÷ base qty", () => {
    expect(saleLineEnteredDiscountPerUnit(line, uomById, {})).toBe(14);
  });

  it("stores line discount as per-pack × pack qty", () => {
    expect(
      saleLineDiscountTotalFromEntered(10, line, 5, uomById, {}),
    ).toBe(50);
  });
});
