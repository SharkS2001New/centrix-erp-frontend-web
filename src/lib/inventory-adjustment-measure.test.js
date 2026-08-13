import { describe, expect, it } from "vitest";
import {
  defaultInventoryAdjustmentMeasure,
  inventoryAdjustmentMeasureLevels,
  inventoryAdjustmentQtyToBase,
  productSellsRetail,
  stockAdjustmentCountLevels,
} from "@/lib/stock-uom";

const sugarBagUom = {
  uom_type: "bag",
  full_name: "Bag",
  conversion_factor: 50,
  small_packaging_label: "kg",
  uses_small_packaging: false,
};

describe("inventory adjustment measure — retail + wholesale", () => {
  it("exposes Bag and kg for Sells W/R products on wholesale-only UOMs", () => {
    const levels = inventoryAdjustmentMeasureLevels(sugarBagUom, { sellOnRetail: true });
    expect(levels.map((l) => l.key)).toEqual(["full", "small"]);
    expect(levels.map((l) => l.label)).toEqual(["Wholesale (Bag)", "Retail (kg)"]);
  });

  it("keeps wholesale-only levels for non-retail products", () => {
    const levels = inventoryAdjustmentMeasureLevels(sugarBagUom, { sellOnRetail: false });
    expect(levels.map((l) => l.key)).toEqual(["full"]);
  });

  it("defaults shop adjustments to retail small units", () => {
    expect(
      defaultInventoryAdjustmentMeasure(sugarBagUom, {
        sellOnRetail: true,
        stockLocation: "shop",
      }),
    ).toBe("small");
  });

  it("defaults store adjustments to wholesale packs", () => {
    expect(
      defaultInventoryAdjustmentMeasure(sugarBagUom, {
        sellOnRetail: true,
        stockLocation: "store",
      }),
    ).toBe("full");
  });

  it("converts retail kg qty to base units", () => {
    expect(
      inventoryAdjustmentQtyToBase(75, "small", sugarBagUom, { sellOnRetail: true }),
    ).toBe(75);
    expect(
      inventoryAdjustmentQtyToBase(2, "full", sugarBagUom, { sellOnRetail: true }),
    ).toBe(100);
  });

  it("detects sell_on_retail flag on products", () => {
    expect(productSellsRetail({ sell_on_retail: true })).toBe(true);
    expect(productSellsRetail({ sell_on_retail: 1 })).toBe(true);
    expect(productSellsRetail({ sell_on_retail: false })).toBe(false);
  });

  it("detects retail from embedded retail_package settings", () => {
    expect(
      productSellsRetail({
        retail_package: { product_code: "1380009", max_qty_measure: 75 },
      }),
    ).toBe(true);
  });

  it("labels wholesale and retail options for Sells W/R products", () => {
    const levels = inventoryAdjustmentMeasureLevels(sugarBagUom, { sellOnRetail: true });
    expect(levels.map((l) => l.label)).toEqual([
      "Wholesale (Bag)",
      "Retail (kg)",
    ]);
  });

  it("stockAdjustmentCountLevels uses plain Bag/kg labels like Receive stock", () => {
    const levels = stockAdjustmentCountLevels(sugarBagUom, { sellOnRetail: true });
    expect(levels.map((l) => l.label)).toEqual(["Bag", "kg"]);
  });
});
