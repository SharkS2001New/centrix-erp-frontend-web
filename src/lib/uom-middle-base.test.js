import { describe, expect, it } from "vitest";
import {
  smallPackagingLabel,
  uomHierarchyChain,
  uomIsFullPackageOnly,
  uomMeasureLevels,
  uomStockTakeLevels,
} from "@/lib/uom-packaging";
import {
  baseToHierarchyCounts,
  hierarchyToBase,
  stockTakeCountsToBase,
} from "@/lib/stock-uom";
import { computePosLine, resolvePosQuantity } from "@/lib/pos-line";
import { defaultRetailPricingTier } from "@/components/catalog/retail-pricing-tiers";

const outerCartonUom = {
  uses_small_packaging: false,
  small_packaging_label: "piece",
  middle_packaging_label: "Outer",
  middle_factor: null,
  full_name: "Carton",
  conversion_factor: 12,
  uom_type: "carton",
};

describe("middle-package base UOM without small-unit breakdown", () => {
  it("uses Outer as the base and offers only Outer and Carton levels", () => {
    expect(uomIsFullPackageOnly(outerCartonUom)).toBe(false);
    expect(smallPackagingLabel(outerCartonUom)).toBe("Outer");
    expect(uomStockTakeLevels(outerCartonUom)).toEqual([
      { level: "full", key: "full", label: "Carton" },
      { level: "middle", key: "middle", label: "Outer" },
    ]);
    expect(uomMeasureLevels(outerCartonUom)).toEqual([
      { level: "middle", label: "Outer" },
      { level: "full", label: "Carton" },
    ]);
    expect(uomHierarchyChain(outerCartonUom)).toBe("Carton → Outer");
  });

  it("converts carton and outer stock counts to base outer units", () => {
    expect(hierarchyToBase(2, 3, 0, outerCartonUom)).toBe(27);
    expect(stockTakeCountsToBase({ full: 2, middle: 3 }, outerCartonUom)).toBe(27);
    expect(baseToHierarchyCounts(27, outerCartonUom)).toEqual({
      full: 2,
      middle: 3,
      small: 0,
      loose: 0,
    });
  });

  it("uses Outers for retail entry and converts Cartons for wholesale entry", () => {
    const product = {
      sell_on_retail: true,
      uom: outerCartonUom,
    };
    const tiers = {
      pricing_tiers: [
        {
          min_qty: 1,
          max_qty: 11,
          measure_level: "middle",
          price_mode: "retail",
          markup_price: 0,
        },
      ],
    };

    const retail = resolvePosQuantity("2", product, tiers, false);
    const wholesale = resolvePosQuantity("2", product, tiers, true);

    expect(retail.baseQty).toBe(2);
    expect(retail.packagingLabel).toBe("Outer");
    expect(wholesale.baseQty).toBe(24);
    expect(wholesale.packQty).toBe(2);
    expect(wholesale.packagingLabel).toBe("Carton");
  });

  it("defaults retail tiers to Outer and prices each mode in its selected unit", () => {
    const product = {
      unit_price: 1200,
      sell_on_retail: true,
      uom: outerCartonUom,
    };
    const retailTier = defaultRetailPricingTier(outerCartonUom);
    expect(retailTier.measure_level).toBe("middle");

    const retail = computePosLine({
      product,
      entryQty: "2",
      sellWholesale: false,
      retailPackage: {
        pricing_tiers: [
          {
            min_qty: 1,
            max_qty: 11,
            measure_level: "middle",
            price_mode: "retail",
            markup_price: 10,
          },
        ],
      },
    });
    const wholesale = computePosLine({
      product,
      entryQty: "2",
      sellWholesale: true,
      retailPackage: null,
    });

    expect(retail.baseQty).toBe(2);
    expect(retail.lineAmount).toBe(220);
    expect(retail.qtyLabel).toBe("2 Outer");
    expect(wholesale.baseQty).toBe(24);
    expect(wholesale.lineAmount).toBe(2400);
    expect(wholesale.qtyLabel).toBe("2 Carton");
  });
});