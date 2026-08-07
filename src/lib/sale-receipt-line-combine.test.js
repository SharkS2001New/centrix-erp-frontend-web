import { describe, expect, it } from "vitest";
import { findMergeableCartLine } from "@/lib/pos-cart-merge";
import { combineIdenticalSaleItemsForPrint } from "@/lib/sale-receipt-line-combine";

describe("findMergeableCartLine combine setting", () => {
  const lines = [
    {
      id: 1,
      product_code: "SUGAR",
      on_wholesale_retail: 0,
      quantity: 10,
    },
  ];
  const computed = { isRetail: false, baseQty: 2 };
  const product = { product_code: "SUGAR", sells_retail: false };

  it("merges by default", () => {
    expect(
      findMergeableCartLine(lines, "SUGAR", computed, {}, true, null, product),
    ).toBe(lines[0]);
  });

  it("skips merge when combineIdenticalLines is false", () => {
    expect(
      findMergeableCartLine(
        lines,
        "SUGAR",
        computed,
        {},
        true,
        null,
        product,
        { combineIdenticalLines: false },
      ),
    ).toBeNull();
  });
});

describe("combineIdenticalSaleItemsForPrint", () => {
  it("sums qty and amounts without re-pricing", () => {
    const items = [
      {
        product_code: "SUGAR",
        product_name: "Sugar",
        on_wholesale_retail: 1,
        quantity: 10,
        amount: 1200,
        discount_given: 0,
        selling_price: 120,
      },
      {
        product_code: "SUGAR",
        product_name: "Sugar",
        on_wholesale_retail: 1,
        quantity: 2,
        amount: 280,
        discount_given: 0,
        selling_price: 140,
      },
      {
        product_code: "COSMO",
        product_name: "Cosmo",
        on_wholesale_retail: 0,
        quantity: 1,
        amount: 500,
        discount_given: 0,
      },
    ];

    const combined = combineIdenticalSaleItemsForPrint(items);
    expect(combined).toHaveLength(2);
    expect(combined[0].product_code).toBe("SUGAR");
    expect(combined[0].quantity).toBe(12);
    expect(combined[0].amount).toBe(1480);
    expect(combined[0].selling_price).toBeNull();
    expect(combined[1].product_code).toBe("COSMO");
    expect(combined[1].amount).toBe(500);
  });

  it("keeps retail and wholesale of the same SKU separate", () => {
    const combined = combineIdenticalSaleItemsForPrint([
      { product_code: "A", on_wholesale_retail: 1, quantity: 2, amount: 100 },
      { product_code: "A", on_wholesale_retail: 0, quantity: 1, amount: 80 },
    ]);
    expect(combined).toHaveLength(2);
  });
});
