import { describe, expect, it } from "vitest";
import {
  saleLineSoldUnitPrice,
  saleLineDiscountTotalFromEntered,
  saleLineEnteredDiscountPerUnit,
  saleLineListRowAmount,
  saleLinePreviewRowAmount,
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

  it("shows stored selling_price, not current product.unit_price", () => {
    const pricedLine = {
      ...line,
      selling_price: 91.44,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      product: {
        unit_id: 1,
        unit_price: 120,
        unit: uomById.get(1),
      },
    };
    expect(saleLineSoldUnitPrice(pricedLine, uomById)).toBe(91.44);
  });

  it("upgrades legacy per-base selling_price to gross per sold pack", () => {
    const pricedLine = {
      ...line,
      selling_price: 3.0976,
      quantity: 25,
      amount: 77.44,
      discount_given: 14,
      product: {
        unit_id: 1,
        unit: uomById.get(1),
      },
    };
    expect(saleLineSoldUnitPrice(pricedLine, uomById)).toBe(91.44);
  });

  it("returns stored line amount from the database", () => {
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
    expect(saleLineListRowAmount(pricedLine)).toBe(2272);
  });

  it("edit preview returns stored amount when qty and discount are unchanged", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      draftQty: "1",
      draftDiscount: 14,
      product: {
        unit_id: 1,
        unit: uomById.get(1),
      },
    };
    expect(
      saleLinePreviewRowAmount(pricedLine, "1", uomById, {
        draftDiscount: 14,
        discountEditEnabled: true,
      }),
    ).toBe(2272);
  });

  it("edit preview scales stored amount when qty changes", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      draftQty: "1",
      product: {
        unit_id: 1,
        unit: uomById.get(1),
      },
    };
    expect(saleLinePreviewRowAmount(pricedLine, "2", uomById)).toBe(4544);
  });
});
