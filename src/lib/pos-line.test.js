import { describe, expect, it } from "vitest";
import { cartLineDisplayUnitPrice, computePosLine } from "@/lib/pos-line";

const sugarUom = {
  conversion_factor: 50,
  measure_name: "kg",
  package_name: "bag",
  uom_type: "bag",
  full_name: "bag",
};

const sugarProduct = {
  product_code: "SUGAR",
  unit_price: 6250,
  uom: sugarUom,
};

const sugarRetailPackage = {
  pricing_tiers: [
    {
      min_qty: 1,
      max_qty: 12.5,
      measure_level: "small",
      price_mode: "retail",
      markup_price: 5,
    },
    {
      min_qty: 13,
      max_qty: 50,
      measure_level: "full",
      price_mode: "wholesale",
      markup_price: 30,
    },
  ],
};

describe("computePosLine retail amount vs unit", () => {
  it("keeps wholesale unit and adds markup on amount for 25/50/75 kg", () => {
    const cases = [
      { qty: "25", amount: 3155, unit: 125 },
      { qty: "50", amount: 6310, unit: 125 },
      { qty: "75", amount: 9465, unit: 125 },
    ];
    for (const { qty, amount, unit } of cases) {
      const line = computePosLine({
        product: sugarProduct,
        entryQty: qty,
        sellWholesale: false,
        retailPackage: sugarRetailPackage,
      });
      expect(line.displayUnitPrice).toBe(unit);
      expect(line.lineAmount).toBe(amount);
      // Must not be “markup inside unit” × qty (e.g. 130×25)
      expect(line.displayUnitPrice * Number(qty)).toBeLessThan(amount);
    }
  });

  it("applies cashier unit override as wholesale/kg then adds amount markup", () => {
    const line = computePosLine({
      product: sugarProduct,
      entryQty: "25",
      sellWholesale: false,
      retailPackage: sugarRetailPackage,
      unitPriceOverride: 125,
    });
    expect(line.lineAmount).toBe(3155);
    expect(line.displayUnitPrice).toBe(125);
  });

  it("prices legacy retail package settings for 25kg sugar", () => {
    const legacyPackage = {
      max_qty_measure: 50,
      markup_price: 30,
      wholesale_qty_measure: 0,
    };
    const line = computePosLine({
      product: sugarProduct,
      entryQty: "25",
      sellWholesale: false,
      retailPackage: legacyPackage,
    });
    expect(line.lineAmount).toBe(3155);
    expect(line.displayUnitPrice).toBe(125);
  });
});

describe("cartLineDisplayUnitPrice wholesale", () => {
  it("does not multiply API pack unit_price by conversion factor", () => {
    // Backend stores wholesale unit_price as amount ÷ bag qty (6,250), not per kg.
    expect(
      cartLineDisplayUnitPrice(
        {
          unit_price: 6250,
          display_unit_price: 6250,
          quantity: 25,
          amount: 3125,
          on_wholesale_retail: 0,
        },
        sugarUom,
        false,
      ),
    ).toBe(6250);
  });

  it("uses amount ÷ pack qty when display_unit_price is missing", () => {
    expect(
      cartLineDisplayUnitPrice(
        {
          unit_price: 6250,
          quantity: 25,
          amount: 3125,
          on_wholesale_retail: 0,
        },
        sugarUom,
        false,
      ),
    ).toBe(6250);
  });

  it("scales local per-base unit_price only when it matches amount", () => {
    expect(
      cartLineDisplayUnitPrice(
        {
          unit_price: 125,
          quantity: 25,
          amount: 3125,
          on_wholesale_retail: 0,
        },
        sugarUom,
        false,
      ),
    ).toBe(6250);
  });
});
