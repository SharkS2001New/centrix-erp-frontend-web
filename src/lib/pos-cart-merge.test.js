import { describe, expect, it } from "vitest";
import {
  applyCartMutationResponse,
  applyOptimisticCartMutation,
  buildOptimisticCartLine,
  cartLineMatchesRef,
  cartLineRef,
  mergePreservedOptimisticLines,
  revertOptimisticCartMutation,
} from "@/lib/pos-cart-merge";

describe("cartLineRef", () => {
  it("falls back to id when update_code is blank", () => {
    expect(cartLineRef({ id: 42, update_code: "" })).toBe(42);
    expect(cartLineRef({ id: 42, update_code: "   " })).toBe(42);
    expect(cartLineRef({ id: 42, update_code: "CLU-X" })).toBe("CLU-X");
  });

  it("prefers client_line_id over id", () => {
    expect(
      cartLineRef({ id: "pending-1", client_line_id: "cli-9", update_code: "" }),
    ).toBe("cli-9");
  });
});

describe("cartLineMatchesRef", () => {
  it("matches after optimistic id remint via client_line_id", () => {
    const live = {
      id: 99,
      update_code: "CLU-99",
      client_line_id: "cli-swap",
      product_code: "A",
    };
    expect(cartLineMatchesRef(live, "cli-swap")).toBe(true);
    expect(cartLineMatchesRef(live, "pending-old")).toBe(false);
    expect(
      cartLineMatchesRef(live, {
        id: "pending-old",
        client_line_id: "cli-swap",
        update_code: "pending-old",
      }),
    ).toBe(true);
  });

  it("matches string target against update_code", () => {
    expect(
      cartLineMatchesRef(
        { id: 1, update_code: "CLU-1", product_code: "X" },
        "CLU-1",
      ),
    ).toBe(true);
  });
});

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

  it("falls back to editingId when update_code no longer matches (previous-order restore)", () => {
    const prev = {
      id: "edit:9",
      update_no: 1,
      lines: [
        {
          id: 55,
          update_code: "CLU-NEW",
          product_code: "OLD",
          product_name: "Old",
          quantity: 2,
          amount: 20,
          on_wholesale_retail: 0,
        },
      ],
    };
    const optimistic = buildOptimisticCartLine(
      { product_code: "NEW", product_name: "New" },
      {
        product_code: "NEW",
        quantity: 2,
        unit_price: 15,
        display_unit_price: 15,
        uom: "PCS",
        product_vat: 0,
        discount_given: 0,
        on_wholesale_retail: 0,
      },
      { lineAmount: 30 },
    );
    const next = applyOptimisticCartMutation(prev, optimistic, {
      editingRef: "sale-item-99",
      editingId: 55,
    });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].product_code).toBe("NEW");
    expect(next.lines[0].id).toBe(55);
    expect(next.lines[0].update_code).toBe("CLU-NEW");
  });

  it("updates qty in place and never duplicates when edit target resolves by id", () => {
    const prev = {
      id: 10,
      update_no: 2,
      lines: [
        {
          id: 42,
          update_code: "",
          product_code: "SOAP",
          quantity: 2,
          amount: 200,
          on_wholesale_retail: 0,
        },
      ],
    };
    const optimistic = buildOptimisticCartLine(
      { product_code: "SOAP", product_name: "Soap" },
      {
        product_code: "SOAP",
        quantity: 6,
        unit_price: 100,
        display_unit_price: 100,
        uom: "PCS",
        product_vat: 0,
        discount_given: 0,
        on_wholesale_retail: 0,
      },
      { lineAmount: 600 },
    );
    const next = applyOptimisticCartMutation(prev, optimistic, { editingRef: 42 });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].id).toBe(42);
    expect(next.lines[0].quantity).toBe(6);
  });

  it("does not push a duplicate row when the edit target is missing", () => {
    const prev = {
      id: 10,
      update_no: 2,
      lines: [
        {
          id: 1,
          update_code: "u1",
          product_code: "A",
          quantity: 1,
          amount: 10,
          on_wholesale_retail: 0,
        },
      ],
    };
    const optimistic = buildOptimisticCartLine(
      { product_code: "A", product_name: "A" },
      {
        product_code: "A",
        quantity: 3,
        unit_price: 10,
        display_unit_price: 10,
        uom: "PCS",
        product_vat: 0,
        discount_given: 0,
        on_wholesale_retail: 0,
      },
      { lineAmount: 30 },
    );
    const next = applyOptimisticCartMutation(prev, optimistic, { editingRef: "missing" });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].quantity).toBe(1);
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
