import { describe, expect, it } from "vitest";
import {
  buildPaymentAdjustmentsFromCheckoutBody,
  computePreviousOrderEditPaymentDelta,
  computePreviousOrderEditSignedDelta,
  previousOrderAdjustmentsMatchDelta,
  resolvePosPaymentMethodCode,
} from "@/lib/pos-edit-payment-adjustment";

describe("resolvePosPaymentMethodCode", () => {
  it("maps cashier shorthand to canonical codes", () => {
    expect(resolvePosPaymentMethodCode("c")).toBe("CASH");
    expect(resolvePosPaymentMethodCode("M")).toBe("MPESA");
    expect(resolvePosPaymentMethodCode("E")).toBe("EQUITY");
    expect(resolvePosPaymentMethodCode("ECO")).toBe("ECOBANK");
  });

  it("matches catalog method codes", () => {
    const catalog = [{ method_code: "COOP", method_name: "Co-op Bank" }];
    expect(resolvePosPaymentMethodCode("COOP", catalog)).toBe("COOP");
  });
});

describe("buildPaymentAdjustmentsFromCheckoutBody", () => {
  it("maps payment splits to adjustment rows", () => {
    const delta = { amount: 1000, type: "return" };
    const rows = buildPaymentAdjustmentsFromCheckoutBody(
      {
        payment_splits: [
          { method_code: "CASH", amount: 600 },
          { method_code: "MPESA", amount: 400, reference_number: "ABC123" },
        ],
      },
      delta,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ method_code: "CASH", amount: 600, adjustment_type: "return" });
    expect(rows[1]).toMatchObject({
      method_code: "MPESA",
      amount: 400,
      adjustment_type: "return",
      reference_number: "ABC123",
    });
  });

  it("scales payment splits when cashier enters the full revised bill", () => {
    const delta = { amount: 6516.66, type: "topup" };
    const rows = buildPaymentAdjustmentsFromCheckoutBody(
      {
        payment_method_code: "CASH",
        pay_now: 12510,
        payment_splits: [{ method_code: "CASH", amount: 12510 }],
      },
      delta,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method_code: "CASH",
      amount: 6516.66,
      adjustment_type: "topup",
    });
  });

  it("uses edit delta instead of pay_now for a single tender", () => {
    const delta = { amount: 500, type: "topup" };
    const rows = buildPaymentAdjustmentsFromCheckoutBody(
      { payment_method_code: "CASH", pay_now: 9000 },
      delta,
    );
    expect(rows).toEqual([
      {
        method_code: "CASH",
        amount: 500,
        adjustment_type: "topup",
        reference_number: null,
      },
    ]);
  });
});

describe("computePreviousOrderEditPaymentDelta", () => {
  const editCart = {
    held_order_num: 42,
    superseded_sale_id: 100,
    lines: [{ product_code: "A1", quantity: 1, unit_price: 9000 }],
  };

  it("returns zero when not a previous-order edit", () => {
    expect(
      computePreviousOrderEditPaymentDelta({ order_total: 10000 }, { lines: [] }).amount,
    ).toBe(0);
  });

  it("detects refund when total drops", () => {
    const delta = computePreviousOrderEditPaymentDelta(
      { order_total: 10000 },
      editCart,
    );
    expect(delta.type).toBe("return");
    expect(delta.amount).toBe(1000);
    expect(delta.originalTotal).toBe(10000);
    expect(delta.newTotal).toBe(9000);
  });

  it("detects top-up when total rises", () => {
    const cart = {
      ...editCart,
      lines: [{ product_code: "A1", quantity: 1, unit_price: 11000 }],
    };
    const delta = computePreviousOrderEditPaymentDelta({ order_total: 10000 }, cart);
    expect(delta.type).toBe("topup");
    expect(delta.amount).toBe(1000);
  });

  it("prefers cart.original_order_total when source sale omits totals", () => {
    const cart = {
      ...editCart,
      original_order_total: 5993.34,
      lines: [{ product_code: "A1", quantity: 1, unit_price: 12510, amount: 12510 }],
    };
    const delta = computePreviousOrderEditPaymentDelta({ id: 100 }, cart);
    expect(delta.type).toBe("topup");
    expect(delta.amount).toBe(6516.66);
    expect(delta.originalTotal).toBe(5993.34);
  });
});

describe("normalizePreviousOrderEditTenders / rebuildPreviousOrderEditTenders", () => {
  it("scales prior+topup doubles down to the revised order total", async () => {
    const { rebuildPreviousOrderEditTenders } = await import(
      "@/lib/pos-edit-payment-adjustment"
    );
    const tenders = rebuildPreviousOrderEditTenders(
      { cash: 0, mpesa_amount: 13160, equity_amount: 0, kcb_amount: 0 },
      [{ adjustment_type: "topup", method_code: "MPESA", amount: 13160 }],
      13160,
    );
    expect(tenders.mpesa).toBe(13160);
    expect(tenders.amountPaid).toBe(13160);
    expect(tenders.cash + tenders.mpesa + tenders.equity + tenders.kcb).toBe(13160);
  });

  it("adds a real top-up onto prior tenders without inventing change", async () => {
    const { rebuildPreviousOrderEditTenders } = await import(
      "@/lib/pos-edit-payment-adjustment"
    );
    const tenders = rebuildPreviousOrderEditTenders(
      { cash: 0, mpesa_amount: 10000, equity_amount: 0, kcb_amount: 0, order_total: 10000 },
      [{ adjustment_type: "topup", method_code: "MPESA", amount: 3160 }],
      13160,
    );
    expect(tenders.mpesa).toBe(13160);
    expect(tenders.topupAmount).toBe(3160);
    expect(tenders.returnGiven).toBe(0);
  });

  it("never doubles M-Pesa when a bogus full-bill top-up is stored", async () => {
    const { rebuildPreviousOrderEditTenders, paymentRowsFromPreviousOrderEditTenders } =
      await import("@/lib/pos-edit-payment-adjustment");
    const prior = {
      order_total: 13160,
      amount_paid: 13160,
      cash: 0,
      mpesa_amount: 13160,
      equity_amount: 0,
      kcb_amount: 0,
      payment_method_code: "MPESA",
    };
    // Bug: cashier/UI recorded the whole revised total as a top-up with no real delta.
    const tenders = rebuildPreviousOrderEditTenders(
      prior,
      [{ adjustment_type: "topup", method_code: "MPESA", amount: 13160 }],
      13160,
    );
    expect(tenders.mpesa).toBe(13160);
    expect(tenders.topupAmount).toBe(0);
    expect(tenders.amountPaid).toBe(13160);
    const rows = paymentRowsFromPreviousOrderEditTenders(tenders);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ payment_method_code: "MPESA", amount: 13160 });
  });

  it("uses prior tender sum when order_total is missing so top-up is not the full bill", async () => {
    const { rebuildPreviousOrderEditTenders } = await import(
      "@/lib/pos-edit-payment-adjustment"
    );
    const tenders = rebuildPreviousOrderEditTenders(
      { cash: 0, mpesa_amount: 10000, equity_amount: 0, kcb_amount: 0 },
      [{ adjustment_type: "topup", method_code: "MPESA", amount: 10000 }],
      10000,
    );
    expect(tenders.mpesa).toBe(10000);
    expect(tenders.topupAmount).toBe(0);
  });

  it("records return change without inflating M-Pesa", async () => {
    const { rebuildPreviousOrderEditTenders } = await import(
      "@/lib/pos-edit-payment-adjustment"
    );
    const tenders = rebuildPreviousOrderEditTenders(
      {
        order_total: 10000,
        cash: 0,
        mpesa_amount: 10000,
        equity_amount: 0,
        kcb_amount: 0,
      },
      [{ adjustment_type: "return", method_code: "CASH", amount: 2000 }],
      8000,
    );
    expect(tenders.mpesa).toBe(8000);
    expect(tenders.returnGiven).toBe(2000);
    expect(tenders.topupAmount).toBe(0);
  });
});

describe("computePreviousOrderEditSignedDelta", () => {
  it("returns negative signed delta for refunds", () => {
    const cart = {
      held_order_num: 1,
      superseded_sale_id: 9,
      lines: [{ product_code: "A", quantity: 1, unit_price: 9000 }],
    };
    const result = computePreviousOrderEditSignedDelta({ order_total: 10000 }, cart);
    expect(result.signedDelta).toBe(-1000);
    expect(result.type).toBe("return");
  });
});

describe("previousOrderAdjustmentsMatchDelta", () => {
  it("passes when no adjustment is required", () => {
    expect(previousOrderAdjustmentsMatchDelta([], { amount: 0, type: null })).toBe(true);
  });

  it("requires matching adjustment rows", () => {
    const delta = { amount: 1000, type: "return" };
    expect(previousOrderAdjustmentsMatchDelta([], delta)).toBe(false);
    expect(
      previousOrderAdjustmentsMatchDelta(
        [{ adjustment_type: "return", amount: 1000, method_code: "CASH" }],
        delta,
      ),
    ).toBe(true);
  });
});
