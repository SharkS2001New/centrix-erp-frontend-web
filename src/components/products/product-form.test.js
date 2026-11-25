import { describe, expect, it } from "vitest";
import {
  EMPTY_PRODUCT_FORM,
  buildProductBody,
  productToForm,
  validateRetailPackage,
} from "@/components/products/product-form";

const liquidUom = {
  id: 8,
  conversion_factor: 150,
  full_name: "Bottle",
  small_packaging_label: "ml",
  uom_type: "bottle",
};

describe("product sell-by-amount configuration", () => {
  it("persists the mode and keeps reorder points in liquid base units", () => {
    const form = {
      ...EMPTY_PRODUCT_FORM,
      product_code: "PERFUME",
      product_name: "Refill perfume",
      subcategory_id: "1",
      unit_id: "8",
      unit_price: "5000",
      vat_id: "1",
      sell_on_retail: true,
      sell_by_amount: true,
      reorder_packs: "75",
    };

    const body = buildProductBody(form, liquidUom);
    const editForm = productToForm(
      {
        product_code: "PERFUME",
        product_name: "Refill perfume",
        unit_id: 8,
        unit_price: 5000,
        sell_on_retail: true,
        sell_by_amount: true,
        reorder_point: 75,
        vat_id: 1,
      },
      null,
      liquidUom,
    );

    expect(body.sell_by_amount).toBe(true);
    expect(body.reorder_point).toBe(75);
    expect(editForm.sell_by_amount).toBe(true);
    expect(editForm.reorder_packs).toBe("75");
  });

  it("does not require tier pricing when amount sales is enabled", () => {
    expect(
      validateRetailPackage({
        sell_on_retail: true,
        sell_by_amount: true,
        retail_pricing_tiers: [],
      }),
    ).toBeNull();
  });
});
