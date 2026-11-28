import { describe, expect, it } from "vitest";
import { productSellByAmountPriceLabel } from "@/lib/sell-by-amount";

describe("sell-by-amount product price labels", () => {
  it("shows the configured amount and equivalent millilitres", () => {
    expect(
      productSellByAmountPriceLabel({
        sell_by_amount: true,
        sell_by_amount_price: 100,
        sell_by_amount_quantity: 300,
        product_uom: { small_packaging_label: "ml" },
      }),
    ).toBe("KES 100.00 = 300 ml");
  });

  it("converts litre-based reference quantities to millilitres", () => {
    expect(
      productSellByAmountPriceLabel({
        sell_by_amount: 1,
        sell_by_amount_price: 100,
        sell_by_amount_quantity: 0.3,
        product_uom: { small_packaging_label: "litre" },
      }),
    ).toBe("KES 100.00 = 300 ml");
  });

  it("leaves ordinary or incomplete product prices to the regular price cell", () => {
    expect(
      productSellByAmountPriceLabel({
        sell_by_amount: false,
        sell_by_amount_price: 100,
        sell_by_amount_quantity: 300,
      }),
    ).toBeNull();
    expect(
      productSellByAmountPriceLabel({
        sell_by_amount: true,
        sell_by_amount_price: 100,
        sell_by_amount_quantity: 0,
      }),
    ).toBeNull();
  });
});
