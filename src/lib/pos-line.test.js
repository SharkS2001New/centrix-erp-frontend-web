import { describe, expect, it } from "vitest";
import { computePosLine } from "@/lib/pos-line";

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

  it("does not treat pack-scaled unit as per-kg override", () => {
    // Old bug: display was (3155/25)*50 = 6310, then amount = 25*6310
    const line = computePosLine({
      product: sugarProduct,
      entryQty: "25",
      sellWholesale: false,
      retailPackage: sugarRetailPackage,
    });
    expect(line.displayUnitPrice).not.toBe(6310);
    expect(line.lineAmount).toBe(3155);
  });
});
