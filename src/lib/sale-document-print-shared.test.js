import { describe, expect, it } from "vitest";
import {
  formatThermalPrintAmount,
  formatThermalPrintUnitPrice,
  resolveSaleOrderCreatorName,
} from "@/lib/sale-document-print-shared";
import { buildPreviousOrderEditPrintSale } from "@/lib/pos-offline";
import { saleLinePrintQtyPackage } from "@/lib/sale-line-items";

describe("resolveSaleOrderCreatorName", () => {
  it("prefers the sale cashier over the reprinting session user", () => {
    expect(
      resolveSaleOrderCreatorName(
        {
          cashier: { username: "till1", full_name: "Jane Cashier" },
        },
        "admin.login",
      ),
    ).toBe("Jane Cashier");
  });

  it("uses cashier_name / created_by_name when relation is missing", () => {
    expect(
      resolveSaleOrderCreatorName(
        { cashier_name: "Order Creator", cashier_id: 9 },
        "logged.in",
      ),
    ).toBe("Order Creator");
  });

  it("falls back to preparedBy only when the sale has no creator fields", () => {
    expect(resolveSaleOrderCreatorName({ id: 1 }, "Session User")).toBe("Session User");
    expect(resolveSaleOrderCreatorName(null, "Session User")).toBe("Session User");
  });
});

describe("formatThermalPrintUnitPrice", () => {
  it("keeps whole shillings when exact", () => {
    expect(formatThermalPrintUnitPrice(153)).toBe(formatThermalPrintAmount(153));
  });

  it("keeps cents when qty × price must match the line amount", () => {
    expect(formatThermalPrintUnitPrice(152.5)).toBe("152.50");
  });
});

describe("buildPreviousOrderEditPrintSale bag lines", () => {
  const bagUom = {
    id: 9,
    conversion_factor: 50,
    full_name: "bag",
    small_packaging_label: "kg",
    uses_small_packaging: true,
    uom_type: "bag",
  };

  it("snapshots UOM from productByCode so reprints show bags not kg", () => {
    const sale = buildPreviousOrderEditPrintSale(
      {
        held_order_num: 100,
        superseded_sale_id: 55,
        pos_order_num: 18,
        original_order_total: 145,
        payment_method_code: "CASH",
        lines: [
          {
            product_code: "92003",
            product_name: "KAMANDE LARGE 50KG",
            quantity: 100,
            unit_price: 3.05,
            display_unit_price: 152.5,
            amount: 305,
            on_wholesale_retail: 0,
          },
        ],
      },
      {
        productByCode: {
          92003: { product_code: "92003", unit_id: 9, uom: bagUom },
        },
        sourceSale: {
          id: 55,
          order_total: 145,
          cash: 145,
          payment_method_code: "CASH",
        },
      },
    );

    expect(sale).not.toBeNull();
    expect(sale.items[0].unit?.conversion_factor).toBe(50);
    expect(sale.items[0].display_unit_price).toBe(152.5);
    expect(sale.items[0].on_wholesale_retail).toBe(false);
    expect(saleLinePrintQtyPackage(sale.items[0], new Map([[9, bagUom]]))).toEqual({
      quantity: "2",
      package: "bag",
    });
    expect(sale.order_total).toBe(305);
  });
});
