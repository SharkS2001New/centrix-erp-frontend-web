import { describe, expect, it } from "vitest";
import {
  applyCatalogPricesToCart,
  cartLineDisplayUnitPrice,
  computePosLine,
  posEntryQtyFromCartLine,
  posEntryToBaseQty,
  posLineWholesaleRetailFlag,
  posListUnitPrice,
  resolvePosQuantity,
} from "@/lib/pos-line";

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
  sell_on_retail: true,
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

describe("F12 qty Enter keeps typed quantity", () => {
  it("retail session uses typed qty as kg (never × conversion factor)", () => {
    expect(posEntryToBaseQty("5", sugarProduct, false, sugarRetailPackage)).toBe(5);
    expect(posEntryToBaseQty("5", sugarProduct, false, null)).toBe(5);
    expect(resolvePosQuantity("5", sugarProduct, null, false).baseQty).toBe(5);
  });

  it("wholesale session keeps typed pack count (5 bags → 5 × factor base)", () => {
    expect(posEntryToBaseQty("5", sugarProduct, true, sugarRetailPackage)).toBe(250);
    expect(resolvePosQuantity("5", sugarProduct, sugarRetailPackage, true).packQty).toBe(5);
  });

  it("switching modes does not rescale the number the cashier typed", () => {
    expect(posEntryToBaseQty("5", sugarProduct, false, sugarRetailPackage)).toBe(5);
    expect(posEntryToBaseQty("5", sugarProduct, true, sugarRetailPackage)).toBe(250);
  });
});

describe("sell_on_retail gate", () => {
  const wholesaleOnly = { ...sugarProduct, sell_on_retail: false };

  it("forces wholesale pricing in retail session when product is wholesale-only", () => {
    const retailLine = computePosLine({
      product: wholesaleOnly,
      entryQty: "1",
      sellWholesale: false,
      retailPackage: sugarRetailPackage,
    });
    const wholesaleLine = computePosLine({
      product: wholesaleOnly,
      entryQty: "1",
      sellWholesale: true,
      retailPackage: sugarRetailPackage,
    });
    expect(retailLine.displayUnitPrice).toBe(6280);
    expect(wholesaleLine.displayUnitPrice).toBe(6280);
    expect(retailLine.isRetail).toBe(false);
  });

  it("does not set on_wholesale_retail when product is wholesale-only", () => {
    expect(
      posLineWholesaleRetailFlag(wholesaleOnly, false, true, { perLineStockRouting: false }),
    ).toBe(false);
    expect(
      posLineWholesaleRetailFlag(wholesaleOnly, false, true, { perLineStockRouting: true }),
    ).toBe(false);
  });
});

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

  it("rounds unit price and amount together when cash rounding is on", () => {
    const product = {
      product_code: "ITEM89",
      unit_price: 89,
      sell_on_retail: true,
      uom: { conversion_factor: 1, measure_name: "pcs", package_name: "pcs", uom_type: "pcs" },
    };
    const line = computePosLine({
      product,
      entryQty: "1",
      sellWholesale: false,
      retailPackage: null,
      cashRound: true,
    });
    expect(line.displayUnitPrice).toBe(90);
    expect(line.lineAmount).toBe(90);
  });
});

describe("posListUnitPrice search display", () => {
  it("includes retail markup for qty 1 in retail session", () => {
    expect(posListUnitPrice(sugarProduct, false, sugarRetailPackage)).toBe(130);
  });

  it("shows per-bag wholesale price for qty 1 pack", () => {
    expect(posListUnitPrice(sugarProduct, true, null)).toBe(6250);
  });
});

describe("posEntryQtyFromCartLine retail lines", () => {
  it("keeps base qty for retail-flagged lines without tiers", () => {
    expect(
      posEntryQtyFromCartLine(
        { quantity: 25, on_wholesale_retail: 1 },
        sugarProduct,
        null,
      ),
    ).toBe("25");
  });
});

describe("applyCatalogPricesToCart per-line mode", () => {
  it("reprices retail and wholesale lines independently", () => {
    const cart = {
      lines: [
        { product_code: "SUGAR", quantity: 25, on_wholesale_retail: 1, unit_price: 100, amount: 100 },
        { product_code: "SUGAR", quantity: 50, on_wholesale_retail: 0, unit_price: 100, amount: 100 },
      ],
    };
    const { cart: priced, updatedCount } = applyCatalogPricesToCart(cart, {
      productByCode: { SUGAR: sugarProduct },
      retailByCode: { SUGAR: sugarRetailPackage },
      sellWholesale: true,
    });
    expect(updatedCount).toBe(2);
    expect(priced.lines[0].display_unit_price).toBe(125);
    expect(priced.lines[1].display_unit_price).toBe(6280);
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

  it("rounds stored display unit price when cash rounding is on", () => {
    expect(
      cartLineDisplayUnitPrice(
        {
          display_unit_price: 89,
          unit_price: 89,
          quantity: 1,
          amount: 90,
          on_wholesale_retail: 1,
        },
        { conversion_factor: 1 },
        true,
        { cashRound: true },
      ),
    ).toBe(90);
  });
});
