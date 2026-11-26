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
  it("defaults stock management off for amount products", () => {
    const form = {
      ...EMPTY_PRODUCT_FORM,
      product_code: "PERFUME",
      product_name: "Refill perfume",
      subcategory_id: "1",
      unit_id: "8",
      unit_price: "",
      vat_id: "1",
      sell_on_retail: true,
      sell_by_amount: true,
      sell_by_amount_quantity: "300",
      sell_by_amount_price: "100",
      reorder_packs: "75",
    };

    const body = buildProductBody(form, liquidUom);
    const editForm = productToForm(
      {
        product_code: "PERFUME",
        product_name: "Refill perfume",
        unit_id: 8,
        sell_by_amount: true,
        sell_by_amount_quantity: "300",
        sell_by_amount_price: "100",
      },
      null,
      liquidUom,
    );

    expect(EMPTY_PRODUCT_FORM.manage_stock).toBe(false);
    expect(body.manage_stock).toBe(false);
    expect(editForm.manage_stock).toBe(false);
  });

  it("persists the mode and keeps reorder points in liquid base units", () => {
    const form = {
      ...EMPTY_PRODUCT_FORM,
      product_code: "PERFUME",
      product_name: "Refill perfume",
      subcategory_id: "1",
      unit_id: "8",
      unit_price: "",
      vat_id: "1",
      sell_on_retail: true,
      sell_by_amount: true,
      manage_stock: true,
      sell_by_amount_quantity: "3",
      sell_by_amount_price: "100",
      reorder_packs: "75",
    };

    const body = buildProductBody(form, liquidUom);
    const editForm = productToForm(
      {
        product_code: "PERFUME",
        product_name: "Refill perfume",
        unit_id: 8,
        unit_price: 0,
        sell_on_retail: true,
        sell_by_amount: true,
        manage_stock: true,
        sell_by_amount_quantity: "3.0000",
        sell_by_amount_price: "100.00",
        reorder_point: 75,
        vat_id: 1,
      },
      null,
      liquidUom,
    );

    expect(body.sell_by_amount).toBe(true);
    expect(body.unit_price).toBeNull();
    expect(body.last_selling_price).toBeNull();
    expect(body.sell_by_amount_quantity).toBe(3);
    expect(body.sell_by_amount_price).toBe(100);
    expect(body.manage_stock).toBe(true);
    expect(body.reorder_point).toBe(75);
    expect(editForm.sell_by_amount).toBe(true);
    expect(editForm.manage_stock).toBe(true);
    expect(editForm.sell_by_amount_quantity).toBe("3.0000");
    expect(editForm.sell_by_amount_price).toBe("100.00");
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

  it("only allows stock opt-out for amount products", () => {
    const amountBody = buildProductBody(
      {
        ...EMPTY_PRODUCT_FORM,
        sell_by_amount: true,
        sell_by_amount_quantity: "300",
        sell_by_amount_price: "100",
        manage_stock: false,
        reorder_packs: "75",
        last_cost_price: "25",
        discount_percentage: "10",
      },
      liquidUom,
    );
    const regularBody = buildProductBody(
      {
        ...EMPTY_PRODUCT_FORM,
        sell_by_amount: false,
        manage_stock: false,
        unit_price: "500",
      },
      liquidUom,
    );

    expect(amountBody.manage_stock).toBe(false);
    expect(amountBody.reorder_point).toBeUndefined();
    expect(amountBody.last_cost_price).toBe(25);
    expect(amountBody.discount_percentage).toBe(10);
    expect(regularBody.manage_stock).toBe(true);
  });
});
