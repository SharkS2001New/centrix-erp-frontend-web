import { describe, expect, it } from "vitest";
import {
  applyCartMutationResponse,
  applyOptimisticCartMutation,
  buildOptimisticCartLine,
  mergePreservedOptimisticLines,
  revertOptimisticCartMutation,
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

describe("applyOptimisticCartMutation (swap / edit)", () => {
  it("replaces the edited row in place without bumping update_no", () => {
    const prev = {
      id: 10,
      update_no: 4,
      lines: [
        {
          id: 1,
          update_code: "u1",
          product_code: "ITEM1",
          product_name: "Item 1",
          quantity: 1,
          amount: 100,
          on_wholesale_retail: 0,
        },
      ],
    };
    const optimistic = buildOptimisticCartLine(
      { product_code: "ITEM2", product_name: "Item 2" },
      {
        product_code: "ITEM2",
        quantity: 1,
        unit_price: 200,
        display_unit_price: 200,
        uom: "PCS",
        product_vat: 0,
        discount_given: 0,
        on_wholesale_retail: 0,
      },
      { lineAmount: 200 },
    );
    const next = applyOptimisticCartMutation(prev, optimistic, { editingRef: "u1" });
    expect(next.update_no).toBe(4);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].product_code).toBe("ITEM2");
    expect(next.lines[0].id).toBe(1);
    expect(next.lines[0].update_code).toBe("u1");
    expect(next.lines[0]._optimistic).toBe(true);
  });

  it("reverts a failed swap back to the previous SKU without changing update_no", () => {
    const previous = {
      id: 1,
      update_code: "u1",
      product_code: "ITEM1",
      product_name: "Item 1",
      quantity: 1,
      amount: 100,
      on_wholesale_retail: 0,
    };
    const painted = {
      id: 10,
      update_no: 4,
      lines: [
        {
          ...previous,
          product_code: "ITEM2",
          product_name: "Item 2",
          amount: 200,
          _optimistic: true,
        },
      ],
    };
    const reverted = revertOptimisticCartMutation(painted, {
      previousLineSnapshot: previous,
    });
    expect(reverted.update_no).toBe(4);
    expect(reverted.lines[0].product_code).toBe("ITEM1");
    expect(reverted.lines[0]._optimistic).toBeUndefined();
  });
});
