import { describe, expect, it } from "vitest";
import {
  applyCartMutationResponse,
  applyOptimisticCartMutation,
  buildOptimisticCartLine,
  cartLineMatchesRef,
  cartLineRef,
  collapseCombineableCartLines,
  mergePreservedOptimisticLines,
  preserveUntouchedCartLines,
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

  it("collapses duplicate server rows for the same SKU", () => {
    const server = [
      { id: 1, product_code: "BANJAB", quantity: 2, amount: 7000, on_wholesale_retail: 0 },
      { id: 2, product_code: "BANJAB", quantity: 2, amount: 7000, on_wholesale_retail: 0 },
    ];
    const merged = mergePreservedOptimisticLines(server, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(4);
    expect(merged[0].amount).toBe(14000);
  });
});

describe("collapseCombineableCartLines", () => {
  it("merges duplicate SKU rows and sums qty/amount", () => {
    const lines = [
      { product_code: "BANJAB", quantity: 2, amount: 7000, on_wholesale_retail: 0 },
      { product_code: "BANJAB", quantity: 2, amount: 7000, on_wholesale_retail: 0 },
      { product_code: "SUGAR", quantity: 1, amount: 140, on_wholesale_retail: 0 },
    ];
    const collapsed = collapseCombineableCartLines(lines);
    expect(collapsed).toHaveLength(2);
    const banjab = collapsed.find((line) => line.product_code === "BANJAB");
    expect(banjab.quantity).toBe(4);
    expect(banjab.amount).toBe(14000);
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

  it("never lowers next_pos_order_num when the server watermark lags local", () => {
    const prev = { id: 10, next_pos_order_num: 42, lines: [{ id: 1, product_code: "A" }] };
    const res = {
      id: 10,
      next_pos_order_num: 39,
      lines: [
        { id: 1, product_code: "A" },
        { id: 2, product_code: "B" },
      ],
    };
    const next = applyCartMutationResponse(prev, res, { extraPosTickets: ["42"] });
    expect(next.next_pos_order_num).toBe(42);
  });

  it("keeps held_order_num and superseded_sale_id when the server response nulls them", () => {
    const prev = {
      id: 10,
      held_order_num: 120,
      superseded_sale_id: 55,
      lines: [{ id: 1, product_code: "A", quantity: 2 }],
    };
    const res = {
      id: 10,
      held_order_num: null,
      superseded_sale_id: null,
      lines: [{ id: 1, product_code: "A", quantity: 1 }],
    };
    const next = applyCartMutationResponse(prev, res);
    expect(next.held_order_num).toBe(120);
    expect(next.superseded_sale_id).toBe(55);
    expect(next.lines[0].quantity).toBe(1);
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

  it("merges into an existing SKU row instead of pushing a second optimistic line", () => {
    const prev = {
      id: 10,
      lines: [
        {
          id: "pending-1",
          product_code: "BANJAB",
          quantity: 2,
          amount: 7000,
          on_wholesale_retail: 0,
          _optimistic: true,
        },
      ],
    };
    const optimistic = buildOptimisticCartLine(
      { product_code: "BANJAB", product_name: "BanjaB" },
      {
        product_code: "BANJAB",
        quantity: 2,
        unit_price: 3500,
        display_unit_price: 3500,
        uom: "BAG",
        product_vat: 0,
        discount_given: 0,
        on_wholesale_retail: 0,
      },
      { lineAmount: 7000 },
    );
    const next = applyOptimisticCartMutation(prev, optimistic);
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].product_code).toBe("BANJAB");
    expect(next.lines[0].id).toBe("pending-1");
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

describe("preserveUntouchedCartLines", () => {
  const mixedCart = {
    id: 1,
    update_no: 3,
    lines: [
      {
        id: 11,
        update_code: "CLU-SUGAR",
        product_code: "SUGAR",
        quantity: 500,
        unit_price: 120,
        display_unit_price: 6000,
        amount: 60000,
        on_wholesale_retail: 0,
        uom: "BAG",
      },
      {
        id: 12,
        update_code: "CLU-KAMANDE",
        product_code: "KAMANDE",
        quantity: 5,
        unit_price: 200,
        display_unit_price: 200,
        amount: 1000,
        on_wholesale_retail: 0,
        uom: "KG",
      },
      {
        id: 13,
        update_code: "CLU-ITEM3",
        product_code: "ITEM3",
        quantity: 2,
        unit_price: 80,
        display_unit_price: 80,
        amount: 160,
        on_wholesale_retail: 1,
        uom: "KG",
      },
      {
        id: 14,
        update_code: "CLU-ITEM4",
        product_code: "ITEM4",
        quantity: 3,
        unit_price: 50,
        display_unit_price: 50,
        amount: 150,
        on_wholesale_retail: 1,
        uom: "KG",
      },
    ],
  };

  it("keeps sibling retail/wholesale prices when one line is F12-repriced", () => {
    const serverCart = {
      ...mixedCart,
      update_no: 4,
      lines: mixedCart.lines.map((line) =>
        line.update_code === "CLU-ITEM3"
          ? {
              ...line,
              on_wholesale_retail: 0,
              unit_price: 4000,
              display_unit_price: 4000,
              amount: 8000,
              uom: "BAG",
            }
          : {
              ...line,
              unit_price: 1,
              display_unit_price: 1,
              amount: 1,
              on_wholesale_retail: 0,
            },
      ),
    };
    const next = preserveUntouchedCartLines(mixedCart, serverCart, {
      targetLineRef: "CLU-ITEM3",
    });
    expect(next.lines[2].on_wholesale_retail).toBe(0);
    expect(next.lines[2].amount).toBe(8000);
    expect(next.lines[0].amount).toBe(60000);
    expect(next.lines[0].on_wholesale_retail).toBe(0);
    expect(next.lines[1].amount).toBe(1000);
    expect(next.lines[3].on_wholesale_retail).toBe(1);
    expect(next.lines[3].amount).toBe(150);
  });

  it("restores sibling flags from a full TemporaryCart PATCH response", () => {
    const serverCart = {
      id: 1,
      update_no: 4,
      next_order_num: 88,
      lines: mixedCart.lines.map((line) => ({
        ...line,
        unit_price: 9,
        amount: 9,
        on_wholesale_retail: 0,
      })),
    };
    const next = applyCartMutationResponse(mixedCart, serverCart, {
      targetLineRef: "CLU-ITEM3",
    });
    expect(next.lines[2].amount).toBe(9);
    expect(next.lines[2].on_wholesale_retail).toBe(0);
    expect(next.lines[0].amount).toBe(60000);
    expect(next.lines[1].on_wholesale_retail).toBe(0);
    expect(next.lines[3].on_wholesale_retail).toBe(1);
    expect(next.lines[3].amount).toBe(150);
  });
});
