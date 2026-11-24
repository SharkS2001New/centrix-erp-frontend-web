import { describe, expect, it } from "vitest";
import {
  availableStockLocations,
  defaultStockLocation,
  inventoryFormFromApi,
  inventoryPayloadFromForm,
  singleStockLocation,
  stockLocationOptionsFor,
} from "@/lib/inventory-settings";

describe("stock location settings", () => {
  it("limits shop-only organizations to shop and aligns inventory defaults", () => {
    const settings = {
      allow_sell_from_shop: true,
      allow_sell_from_store: false,
      default_receive_location: "store",
      default_pos_sale_location: "store",
      default_distribution_sale_location: "store",
    };

    expect(availableStockLocations(settings)).toEqual(["shop"]);
    expect(singleStockLocation(settings)).toBe("shop");
    expect(defaultStockLocation(settings, "store")).toBe("shop");
    expect(stockLocationOptionsFor(settings).map((option) => option.value)).toEqual(["shop"]);
    expect(inventoryFormFromApi({ inventory: settings })).toMatchObject({
      default_receive_location: "shop",
      default_pos_sale_location: "shop",
      default_distribution_sale_location: "shop",
    });
    expect(
      inventoryPayloadFromForm({
        ...settings,
        enable_retail_pricing: false,
        retail_shop_wholesale_store_stock: false,
        allow_negative_stock: false,
        stock_alert_mode: "per_product",
        stock_adjustment_approval_enabled: false,
        damage_write_off_approval_enabled: false,
      }),
    ).toMatchObject({
      default_receive_location: "shop",
      default_pos_sale_location: "shop",
      default_distribution_sale_location: "shop",
    });
  });

  it("limits store-only organizations to store", () => {
    const settings = { allow_sell_from_shop: false, allow_sell_from_store: true };

    expect(availableStockLocations(settings)).toEqual(["store"]);
    expect(stockLocationOptionsFor(settings).map((option) => option.value)).toEqual(["store"]);
  });

  it("keeps both locations for per-product retail and wholesale routing", () => {
    const settings = {
      allow_sell_from_shop: false,
      allow_sell_from_store: false,
      retail_shop_wholesale_store_stock: true,
    };

    expect(availableStockLocations(settings)).toEqual(["shop", "store"]);
    expect(singleStockLocation(settings)).toBeNull();
    expect(stockLocationOptionsFor(settings)).toHaveLength(2);
  });
});
