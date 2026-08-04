import { describe, expect, it } from "vitest";
import {
  applyCartMutationResponse,
  mergePreservedOptimisticLines,
} from "@/lib/pos-cart-merge";

describe("mergePreservedOptimisticLines", () => {
  it("keeps pending optimistic rows the server cart does not have yet", () => {
    const server = [{ id: 1, product_code: "A", on_wholesale_retail: 0, amount: 100 }];
    const prev = [
      { id: 1, product_code: "A", on_wholesale_retail: 0, amount: 100 },
      {
        id: "pending-2",
        product_code: "B",
        on_wholesale_retail: 0,
        amount: 250,
        _optimistic: true,
      },
    ];
    const merged = mergePreservedOptimisticLines(server, prev);
    expect(merged).toHaveLength(2);
    expect(merged[1].product_code).toBe("B");
    expect(merged[1]._optimistic).toBe(true);
  });

  it("drops optimistic once the server has the same SKU flag", () => {
    const server = [
      { id: 9, product_code: "B", on_wholesale_retail: 0, amount: 250 },
    ];
    const prev = [
      {
        id: "pending-2",
        product_code: "B",
        on_wholesale_retail: 0,
        amount: 250,
        _optimistic: true,
      },
    ];
    expect(mergePreservedOptimisticLines(server, prev)).toEqual(server);
  });
});

describe("applyCartMutationResponse", () => {
  it("preserves other optimistic lines when a full cart is returned", () => {
    const prev = {
      id: 10,
      lines: [
        { id: 1, product_code: "A", on_wholesale_retail: 0, amount: 100 },
        {
          id: "pending-b",
          product_code: "B",
          on_wholesale_retail: 0,
          amount: 50,
          _optimistic: true,
        },
      ],
    };
    const res = {
      id: 10,
      lines: [
        { id: 1, product_code: "A", on_wholesale_retail: 0, amount: 100 },
        { id: 2, product_code: "C", on_wholesale_retail: 0, amount: 75 },
      ],
    };
    const next = applyCartMutationResponse(prev, res);
    expect(next.lines.map((l) => l.product_code).sort()).toEqual(["A", "B", "C"]);
  });
});
