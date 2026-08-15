import { describe, it, expect } from "vitest";
import {
  posStockAvailability,
  posCartHasInsufficientStock,
} from "@/lib/pos-stock";

describe("pos-stock basic availability", () => {
  const posSalesConfig = { allowShop: true, allowStore: true, perLineStockRouting: false };
  const product = {
    product_code: "P1",
    stock_available_shop: 5,
    stock_available_store: 10,
    stock_in_shop: 5,
    stock_in_store: 10,
    uom: "kg",
  };

  it("routes to shop when sellFromShop is true and blocks when insufficient", () => {
    const check = posStockAvailability({
      product,
      baseQty: 6,
      cartLines: [],
      sellFromShop: true,
      posSalesConfig,
      allowNegativeStock: false,
    });
    expect(check.location).toBe("shop");
    expect(check.ok).toBe(false);
    expect(check.available).toBeGreaterThanOrEqual(0);
  });

  it("routes to store when sellFromShop is false and allows quantity within available", () => {
    const check = posStockAvailability({
      product,
      baseQty: 6,
      cartLines: [],
      sellFromShop: false,
      posSalesConfig,
      allowNegativeStock: false,
    });
    expect(check.location).toBe("store");
    expect(check.ok).toBe(true);
  });

  it("posCartHasInsufficientStock detects oversell in cart lines", () => {
    const lines = [
      { product_code: "P1", quantity: 3 },
      { product_code: "P1", quantity: 3 },
    ];
    const productByCode = { P1: product };
    const result = posCartHasInsufficientStock(lines, productByCode, true, posSalesConfig, false);
    expect(result).toBe(true);
  });
});
