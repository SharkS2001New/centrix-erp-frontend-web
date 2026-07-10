import { describe, expect, it } from "vitest";
import {
  saleLineCatalogDisplayUnitPrice,
  saleLineDiscountTotalFromEntered,
  saleLineDisplayDiscountPerUnit,
  saleLineEnteredDiscountPerUnit,
  saleLineListRowAmount,
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

  it("shows product.unit_price without UOM conversion", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      product: {
        unit_id: 1,
        unit_price: 91.44,
        unit: uomById.get(1),
      },
    };
    expect(saleLineCatalogDisplayUnitPrice(pricedLine, uomById)).toBe(91.44);
  });

  it("subtracts line discount only on amount", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      product: {
        unit_id: 1,
        unit_price: 91.44,
        unit: uomById.get(1),
      },
    };
    expect(saleLineListRowAmount(pricedLine, uomById)).toBe(2272);
  });

  it("subtracts per-pack discount × pack qty from gross amount", () => {
    const pricedLine = {
      ...line,
      quantity: 125,
      amount: 11330,
      discount_given: 50,
      product: {
        unit_id: 1,
        unit_price: 91.44,
        unit: uomById.get(1),
      },
    };
    expect(saleLineDisplayDiscountPerUnit(pricedLine, uomById)).toBe(10);
    expect(saleLineListRowAmount(pricedLine, uomById)).toBe(11380);
  });
});
