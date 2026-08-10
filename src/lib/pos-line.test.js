import { describe, expect, it } from "vitest";
import {
  applyCatalogPricesToCart,
  cartLineDisplayUnitPrice,
  computePosLine,
  posEntryQtyFromCartLine,
  posEntryQtyForSessionMode,
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

  it("mode switch reprices when unit override is cleared (wholesale ↔ retail)", () => {
    const wholesaleLine = computePosLine({
      product: sugarProduct,
      entryQty: "5",
      sellWholesale: true,
      retailPackage: sugarRetailPackage,
    });
    const retailLine = computePosLine({
      product: sugarProduct,
      entryQty: "5",
      sellWholesale: false,
      retailPackage: sugarRetailPackage,
    });
    expect(wholesaleLine.displayUnitPrice).not.toBe(retailLine.displayUnitPrice);
    expect(wholesaleLine.lineAmount).not.toBe(retailLine.lineAmount);

    // Pack-sized wholesale lock must not be treated as per-kg (would do 6280×50).
    const stuckWholesalePrice = computePosLine({
      product: sugarProduct,
      entryQty: "5",
      sellWholesale: false,
      retailPackage: sugarRetailPackage,
      unitPriceOverride: wholesaleLine.displayUnitPrice,
    });
    expect(stuckWholesalePrice.lineAmount).toBe(retailLine.lineAmount);
    expect(stuckWholesalePrice.displayUnitPrice).toBe(retailLine.displayUnitPrice);
  });
});

describe("pack price lock must not inflate retail amounts", () => {
  it("does not multiply per-bag lock by conversion (BanjaB-style 3600×25 bug)", () => {
    const riceUom = {
      conversion_factor: 25,
      measure_name: "kg",
      package_name: "bag",
      uom_type: "bag",
      full_name: "bag",
    };
    const rice = {
      product_code: "BANJAB",
      unit_price: 3600,
      sell_on_retail: true,
      uom: riceUom,
    };
    const pkg = {
      pricing_tiers: [
        {
          min_qty: 1,
          max_qty: 25,
          measure_level: "full",
          price_mode: "wholesale",
          markup_price: 2000,
        },
      ],
    };
    const wholesale = computePosLine({
      product: rice,
      entryQty: "1",
      sellWholesale: true,
      retailPackage: pkg,
    });
    expect(wholesale.lineAmount).toBe(5600);

    // Reprice 25kg retail while locking the per-bag API/display unit (3600 or 5600).
    const withPackLock = computePosLine({
      product: rice,
      entryQty: "25",
      sellWholesale: false,
      retailPackage: pkg,
      unitPriceOverride: wholesale.displayUnitPrice,
    });
    expect(withPackLock.lineAmount).toBeLessThan(10000);
    expect(withPackLock.lineAmount).not.toBe(92000);
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
  it("shows marked-up unit price (amount ÷ qty) for 25/50/75 kg", () => {
    const cases = [
      { qty: "25", amount: 3155, unit: 126.2 },
      { qty: "50", amount: 6310, unit: 126.2 },
      { qty: "75", amount: 9465, unit: 126.2 },
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
      expect(Math.round(line.displayUnitPrice * Number(qty) * 100) / 100).toBe(amount);
    }
  });

  it("applies cashier unit override as wholesale/kg then shows marked-up unit", () => {
    const line = computePosLine({
      product: sugarProduct,
      entryQty: "25",
      sellWholesale: false,
      retailPackage: sugarRetailPackage,
      unitPriceOverride: 125,
    });
    expect(line.lineAmount).toBe(3155);
    expect(line.displayUnitPrice).toBe(126.2);
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
    expect(line.displayUnitPrice).toBe(126.2);
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

describe("posEntryQtyForSessionMode", () => {
  it("converts wholesale packs to retail kg when F12 flips mode", () => {
    expect(
      posEntryQtyForSessionMode(2, sugarUom, { fromRetail: false, toRetail: true }),
    ).toBe(100);
    expect(
      posEntryQtyForSessionMode(100, sugarUom, { fromRetail: true, toRetail: false }),
    ).toBe(2);
  });

  it("leaves qty unchanged when mode does not flip", () => {
    expect(
      posEntryQtyForSessionMode(2, sugarUom, { fromRetail: false, toRetail: false }),
    ).toBe(2);
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
    expect(priced.lines[0].display_unit_price).toBe(126.2);
    expect(priced.lines[1].display_unit_price).toBe(6280);
  });

  it("does not reprice lines when revising an existing order", () => {
    const cart = {
      held_order_num: 42,
      superseded_sale_id: 99,
      lines: [
        {
          product_code: "SUGAR",
          quantity: 50,
          on_wholesale_retail: 0,
          unit_price: 6300,
          display_unit_price: 6300,
          amount: 6300,
        },
      ],
    };
    const { cart: priced, updatedCount } = applyCatalogPricesToCart(cart, {
      productByCode: { SUGAR: sugarProduct },
      retailByCode: { SUGAR: sugarRetailPackage },
      sellWholesale: true,
    });
    expect(updatedCount).toBe(0);
    expect(priced.lines[0].unit_price).toBe(6300);
    expect(priced.lines[0].display_unit_price).toBe(6300);
  });

  it("keeps route markup when live-repricing an open cart", () => {
    const cart = {
      lines: [
        {
          product_code: "SUGAR",
          quantity: 50,
          on_wholesale_retail: 0,
          unit_price: 100,
          display_unit_price: 100,
          amount: 100,
        },
      ],
    };
    const withoutRoute = applyCatalogPricesToCart(cart, {
      productByCode: { SUGAR: sugarProduct },
      retailByCode: { SUGAR: sugarRetailPackage },
      sellWholesale: true,
    });
    const withRoute = applyCatalogPricesToCart(cart, {
      productByCode: { SUGAR: sugarProduct },
      retailByCode: { SUGAR: sugarRetailPackage },
      sellWholesale: true,
      routeMarkupPerUnit: 10,
    });
    expect(withRoute.updatedCount).toBeGreaterThan(0);
    expect(withRoute.cart.lines[0].amount).toBe(withoutRoute.cart.lines[0].amount + 10);
  });
});

describe("locked sold unit must not double route markup", () => {
  it("skips route when unitPriceOverride is the already-marked-up sold unit", () => {
    const withRoute = computePosLine({
      product: sugarProduct,
      entryQty: "1",
      sellWholesale: true,
      retailPackage: sugarRetailPackage,
      routeMarkupPerUnit: 10,
    });
    // Catalog 6250 + wholesale tier markup 30 + route 10
    expect(withRoute.lineAmount).toBe(6290);

    // Qty merge/edit locks display_unit_price (includes the 10 route) and still
    // passes routeMarkupPerUnit — must not become 6300 (route twice).
    const locked = computePosLine({
      product: sugarProduct,
      entryQty: "2",
      sellWholesale: true,
      retailPackage: sugarRetailPackage,
      unitPriceOverride: withRoute.displayUnitPrice,
      routeMarkupPerUnit: 10,
    });
    expect(locked.lineAmount).toBe(withRoute.displayUnitPrice * 2);
    expect(locked.displayUnitPrice).toBe(withRoute.displayUnitPrice);
    expect(locked.lineAmount).not.toBe(withRoute.displayUnitPrice * 2 + 20);
  });
});

describe("applyCatalogPricesToCart VAT", () => {
  it("recomputes product_vat when amount changes", () => {
    const product = { ...sugarProduct, vat_rate: 16 };
    const cart = {
      lines: [
        {
          product_code: "SUGAR",
          quantity: 50,
          on_wholesale_retail: 0,
          unit_price: 100,
          display_unit_price: 100,
          amount: 100,
          product_vat: 1,
        },
      ],
    };
    const next = applyCatalogPricesToCart(cart, {
      productByCode: { SUGAR: product },
      retailByCode: { SUGAR: sugarRetailPackage },
      sellWholesale: true,
    });
    const amount = next.cart.lines[0].amount;
    const expectedVat = Math.round(((amount * 16) / 116) * 100) / 100;
    expect(next.cart.lines[0].product_vat).toBe(expectedVat);
    expect(next.cart.lines[0].product_vat).not.toBe(1);
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
