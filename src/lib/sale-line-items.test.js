import { describe, expect, it } from "vitest";
import {
  enrichSaleLinesForQtyPrint,
  saleLinePrintQtyPackage,
  saleLineQtyLabel,
  saleLineSoldUnitPrice,
  saleLineDiscountTotalFromEntered,
  saleLineEnteredDiscountPerUnit,
  saleLineListRowAmount,
  saleLinePreviewRowAmount,
  saleLineUom,
} from "@/lib/sale-line-items";

describe("sale line discount display qty", () => {
  const uomById = new Map([
    [
      1,
      {
        id: 1,
        conversion_factor: 25,
        full_name: "bag",
        small_packaging_label: "kg",
        uses_small_packaging: true,
        uom_type: "bag",
      },
    ],
  ]);

  const line = {
    product_code: "RICE25",
    quantity: 25,
    discount_given: 14,
    on_wholesale_retail: 0,
    product: {
      unit_id: 1,
      unit: uomById.get(1),
    },
  };

  it("shows the cashier-entered per-pack discount, not total ÷ base qty", () => {
    expect(saleLineEnteredDiscountPerUnit(line, uomById, {})).toBe(14);
  });

  it("stores line discount as per-pack × pack qty", () => {
    expect(
      saleLineDiscountTotalFromEntered(10, line, 5, uomById, {}),
    ).toBe(50);
  });

  it("prefers API display_unit_price when present", () => {
    const pricedLine = {
      ...line,
      display_unit_price: 2300,
      amount: 2272,
      discount_given: 14,
      product: { unit_id: 1, unit: uomById.get(1) },
    };
    expect(saleLineSoldUnitPrice(pricedLine, uomById)).toBe(2300);
  });

  it("falls back to gross from priced amount so markups are preserved", () => {
    const pricedLine = {
      ...line,
      selling_price: 91.44,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      product: {
        unit_id: 1,
        unit_price: 120,
        unit: uomById.get(1),
      },
    };
    expect(saleLineSoldUnitPrice(pricedLine, uomById)).toBe(2286);
  });

  it("returns stored line amount from the database", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      product: {
        unit_id: 1,
        unit_price: 91.44,
        unit: uomById.get(1),
      },
    };
    expect(saleLineListRowAmount(pricedLine)).toBe(2272);
  });

  it("prefers API display_amount when present", () => {
    expect(saleLineListRowAmount({ amount: 999, display_amount: 2272 })).toBe(2272);
  });

  it("edit preview returns stored amount when qty and discount are unchanged", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      draftQty: "1",
      draftDiscount: 14,
      product: {
        unit_id: 1,
        unit: uomById.get(1),
      },
    };
    expect(
      saleLinePreviewRowAmount(pricedLine, "1", uomById, {
        draftDiscount: 14,
        discountEditEnabled: true,
      }),
    ).toBe(2272);
  });

  it("edit preview scales stored amount when qty changes", () => {
    const pricedLine = {
      ...line,
      quantity: 25,
      amount: 2272,
      discount_given: 14,
      draftQty: "1",
      product: {
        unit_id: 1,
        unit: uomById.get(1),
      },
    };
    expect(
      saleLinePreviewRowAmount(pricedLine, "2", uomById, {
        draftDiscount: 14,
        discountEditEnabled: true,
      }),
    ).toBe(4544);
  });
});

describe("sale line receipt packaging qty", () => {
  const bagUom = {
    id: 1,
    conversion_factor: 25,
    full_name: "bag",
    small_packaging_label: "kg",
    uses_small_packaging: true,
    uom_type: "bag",
  };
  const uomById = new Map([[1, bagUom]]);

  it("prints whole base qty as full packages (25 kg → 1 bag wholesale)", () => {
    const line = {
      product_code: "SUGAR25",
      quantity: 25,
      on_wholesale_retail: 0,
      uom: "bag",
      product: { unit_id: 1, unit: bagUom },
    };
    expect(saleLinePrintQtyPackage(line, uomById)).toEqual({
      quantity: "1",
      package: "bag",
    });
    expect(saleLineQtyLabel(line, uomById)).toBe("1 bag");
  });

  it("prints retail merged kg as small units (75 kg retail)", () => {
    const line = {
      product_code: "SUGAR25",
      quantity: 75,
      on_wholesale_retail: 1,
      product: { unit_id: 1, unit: bagUom },
    };
    expect(saleLinePrintQtyPackage(line, uomById)).toEqual({
      quantity: "75",
      package: "kg",
    });
    expect(saleLineQtyLabel(line, uomById)).toBe("75 kg");
  });

  it("prints wholesale fractional packs (37.5 kg → 1.5 bag)", () => {
    const line = {
      product_code: "SUGAR25",
      quantity: 37.5,
      on_wholesale_retail: 0,
      product: { unit_id: 1, unit: bagUom },
    };
    expect(saleLinePrintQtyPackage(line, uomById)).toEqual({
      quantity: "1.5",
      package: "bag",
    });
    expect(saleLineQtyLabel(line, uomById)).toBe("1.5 bag");
  });

  it("prints wholesale as pack count not loose hierarchy", () => {
    const line = {
      product_code: "SUGAR25",
      quantity: 30,
      on_wholesale_retail: 0,
      product: { unit_id: 1, unit: bagUom },
    };
    expect(saleLinePrintQtyPackage(line, uomById)).toEqual({
      quantity: "1.2",
      package: "bag",
    });
  });

  it("resolves UOM from productByCode enrichment when checkout omits product.unit", () => {
    const bare = {
      product_code: "SUGAR25",
      quantity: 25,
      uom: "bag",
    };
    expect(saleLineUom(bare, uomById)).toBeNull();
    const enriched = enrichSaleLinesForQtyPrint(
      { items: [bare] },
      {
        productByCode: {
          SUGAR25: { product_code: "SUGAR25", unit_id: 1, uom: bagUom },
        },
        uomById,
      },
    );
    expect(saleLinePrintQtyPackage(enriched.items[0], uomById)).toEqual({
      quantity: "1",
      package: "bag",
    });
  });

  it("falls back to nested product.unit when uomById misses the id", () => {
    const line = {
      product_code: "SUGAR25",
      quantity: 50,
      product: { unit_id: 99, unit: bagUom },
    };
    expect(saleLinePrintQtyPackage(line, new Map())).toEqual({
      quantity: "2",
      package: "bag",
    });
  });

  it("omits full-package-only UOM label on documents by default", () => {
    const baleUom = {
      id: 2,
      full_name: "bale",
      uom_type: "bale",
      conversion_factor: 1,
      uses_small_packaging: false,
    };
    const uoms = new Map([[2, baleUom]]);
    const line = {
      product_code: "ASIS50G",
      quantity: 1,
      on_wholesale_retail: 0,
      product: { unit_id: 2, unit: baleUom },
    };
    expect(saleLinePrintQtyPackage(line, uoms)).toEqual({
      quantity: "1",
      package: "",
    });
    expect(saleLineQtyLabel(line, uoms)).toBe("1");
  });

  it("shows full-package-only UOM when org enables it on documents", () => {
    const baleUom = {
      id: 2,
      full_name: "bale",
      uom_type: "bale",
      conversion_factor: 1,
      uses_small_packaging: false,
    };
    const uoms = new Map([[2, baleUom]]);
    const line = {
      product_code: "ASIS50G",
      quantity: 1,
      on_wholesale_retail: 0,
      product: { unit_id: 2, unit: baleUom },
    };
    expect(
      saleLinePrintQtyPackage(line, uoms, { showFullPackageUomOnDocuments: true }),
    ).toEqual({
      quantity: "1",
      package: "bale",
    });
    expect(saleLineQtyLabel(line, uoms, { showFullPackageUomOnDocuments: true })).toBe(
      "1 bale",
    );
  });
});
