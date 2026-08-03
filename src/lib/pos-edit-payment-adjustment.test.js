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
