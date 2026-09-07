import { describe, it, expect, vi } from "vitest";
import {
  productStockFieldsMissing,
  hydrateProductLiveStock,
  mergeProductStockFields,
} from "@/lib/stock-cache";
import { enrichProductForLpo } from "@/components/lpo/lpo-product-utils";

describe("productStockFieldsMissing", () => {
  it("treats stripped catalog rows as missing even when enrich left numeric zeros", () => {
    expect(
      productStockFieldsMissing({
        product_code: "8258278",
        stock_in_shop: 0,
        stock_in_store: 0,
        stock_available_shop: 0,
        stock_available_store: 0,
      }),
    ).toBe(true);
  });

  it("treats live branch_stock overlay as present", () => {
    expect(
      productStockFieldsMissing({
        product_code: "8258278",
        stock_available_shop: 17,
        branch_stock: { shop_available: 17, store_available: 0 },
      }),
    ).toBe(false);
  });
});

describe("enrichProductForLpo stock fields", () => {
  it("does not invent 0 for missing stock from offline catalog", () => {
    const enriched = enrichProductForLpo({ product_code: "8258278", unit_price: 1050 }, new Map(), new Map());
    expect(enriched.stock_in_shop).toBeNull();
    expect(enriched.stock_available_shop).toBeNull();
    expect(productStockFieldsMissing(enriched)).toBe(true);
  });

  it("preserves real live stock quantities", () => {
    const enriched = enrichProductForLpo(
      {
        product_code: "8258278",
        stock_in_shop: 17,
        stock_available_shop: 17,
        branch_stock: { shop_available: 17, store_available: 0 },
      },
      new Map(),
      new Map(),
    );
    expect(enriched.stock_available_shop).toBe(17);
    expect(productStockFieldsMissing(enriched)).toBe(false);
  });
});

describe("hydrateProductLiveStock", () => {
  it("force-refreshes even when branch_stock already exists", async () => {
    const request = vi.fn().mockResolvedValue({
      product_code: "8258278",
      stock_in_shop: 17,
      stock_available_shop: 17,
      branch_stock: { shop_available: 17, store_available: 0 },
    });

    const result = await hydrateProductLiveStock(
      {
        product_code: "8258278",
        stock_available_shop: 0,
        branch_stock: { shop_available: 0, store_available: 0 },
      },
      1,
      request,
      { force: true },
    );

    expect(request).toHaveBeenCalled();
    expect(result.stock_available_shop).toBe(17);
    expect(result.branch_stock.shop_available).toBe(17);
  });

  it("merges live stock over invent-0 catalog rows", () => {
    const merged = mergeProductStockFields(
      { product_code: "8258278", stock_available_shop: 0, stock_in_shop: 0 },
      {
        product_code: "8258278",
        stock_available_shop: 17,
        stock_in_shop: 17,
        branch_stock: { shop_available: 17, store_available: 0 },
      },
    );
    expect(merged.stock_available_shop).toBe(17);
    expect(merged.branch_stock.shop_available).toBe(17);
  });
});
