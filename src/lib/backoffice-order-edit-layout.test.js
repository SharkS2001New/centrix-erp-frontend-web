import { describe, expect, it } from "vitest";
import {
  isClassicBackofficeOrderEditLayout,
  normalizeBackofficeOrderEditLayout,
  resolveBackofficeOrderEditLayout,
} from "@/lib/backoffice-order-edit-layout";
import {
  buildLineQuantitiesSaveBody,
  swapLineWithProduct,
} from "@/lib/backoffice-order-edit";

describe("backoffice-order-edit-layout", () => {
  it("defaults to modern", () => {
    expect(normalizeBackofficeOrderEditLayout(null)).toBe("modern");
    expect(resolveBackofficeOrderEditLayout(null)).toBe("modern");
    expect(isClassicBackofficeOrderEditLayout(null)).toBe(false);
  });

  it("reads classic from module settings / capabilities", () => {
    expect(
      resolveBackofficeOrderEditLayout({
        module_settings: { sales: { backoffice_order_edit_layout: "classic" } },
      }),
    ).toBe("classic");
    expect(
      isClassicBackofficeOrderEditLayout({
        sales: { backoffice_order_edit_layout: "classic" },
      }),
    ).toBe(true);
  });

  it("ignores unknown values", () => {
    expect(normalizeBackofficeOrderEditLayout("legacy")).toBe("modern");
  });
});

describe("swapLineWithProduct", () => {
  it("removes a saved line and inserts a new draft with route markup pricing inputs", () => {
    const product = {
      product_code: "SKU2",
      product_name: "Widget",
      unit_price: 100,
      uom: { unit_name: "PCS", packaging: 1 },
    };
    const lines = [
      {
        id: 42,
        product_code: "SKU1",
        product: { product_code: "SKU1", unit_price: 50, uom: { packaging: 1 } },
        quantity: 2,
        draftQty: "2",
        draftDiscount: 0,
        on_wholesale_retail: 0,
      },
    ];
    const result = swapLineWithProduct({
      lines,
      removedIds: [],
      targetKey: "id-42",
      product,
      entryQty: "3",
      uomById: null,
      retailMap: {},
      asRetail: false,
      routeMarkupPerUnit: 5,
      cashRound: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.removedIds).toEqual([42]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].id).toBeNull();
    expect(result.lines[0].product_code).toBe("SKU2");
    expect(result.lines[0].draftQty).toBe("3");
  });
});

describe("buildLineQuantitiesSaveBody", () => {
  it("includes remove_item_ids after a swap of a saved line", () => {
    const body = buildLineQuantitiesSaveBody({
      lines: [
        {
          id: null,
          clientKey: "n-1",
          product_code: "SKU2",
          draftQty: "3",
          draftDiscount: 0,
          on_wholesale_retail: 0,
          quantity: 3,
          product: { product_code: "SKU2", unit_price: 100, uom: { packaging: 1 } },
          uom: { packaging: 1 },
        },
      ],
      removedIds: [42],
      customerNum: "",
      baselineCustomerNum: "",
      uomById: null,
      retailByCode: {},
      discountEditEnabled: false,
    });
    expect(body.error).toBeUndefined();
    expect(body.remove_item_ids).toEqual([42]);
    expect(body.items).toEqual([
      expect.objectContaining({
        product_code: "SKU2",
        quantity: 3,
        on_wholesale_retail: false,
      }),
    ]);
  });
});
