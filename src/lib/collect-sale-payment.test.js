import { describe, expect, it } from "vitest";
import {
  collectPaymentSplitsFromCheckoutBody,
  resolveCollectPaymentMethods,
  saleCollectableBalance,
  shouldPrefillRemainingCashOnComplete,
} from "@/lib/collect-sale-payment";

describe("saleCollectableBalance", () => {
  it("uses order_total minus amount_paid for the payments API", () => {
    expect(
      saleCollectableBalance({ order_total: 10000, amount_paid: 4000, balance_due: 10000 }),
    ).toBe(6000);
  });

  it("never collects more than the sale remaining even if AR balance_due is higher", () => {
    expect(
      saleCollectableBalance(
        { order_total: 10000, amount_paid: 4000, balance_due: 9000 },
        9000,
      ),
    ).toBe(6000);
  });

  it("returns zero when the sale columns are already fully paid", () => {
    expect(
      saleCollectableBalance(
        { order_total: 99800, amount_paid: 99800, balance_due: 44800 },
        44800,
      ),
    ).toBe(0);
  });

  it("does not treat a missing fallback as a zero balance", () => {
    expect(saleCollectableBalance({ order_total: 10000, amount_paid: 0 }, 0)).toBe(10000);
  });
});

describe("shouldPrefillRemainingCashOnComplete", () => {
  it("does not invent cash when collecting a partial on an unpaid order", () => {
    expect(
      shouldPrefillRemainingCashOnComplete({ allowPartialPayment: true, adjustmentMode: false }),
    ).toBe(false);
  });

  it("still fills remaining cash on POS checkout that requires full payment", () => {
    expect(
      shouldPrefillRemainingCashOnComplete({ allowPartialPayment: false, adjustmentMode: false }),
    ).toBe(true);
  });
});

describe("collectPaymentSplitsFromCheckoutBody", () => {
  it("keeps a typed partial instead of scaling up to the bill", () => {
    const { splits, total } = collectPaymentSplitsFromCheckoutBody(
      {
        pay_now: 3000,
        payment_splits: [{ method_code: "MPESA", amount: 3000, reference_number: "ABC" }],
      },
      10000,
    );
    expect(total).toBe(3000);
    expect(splits).toEqual([
      { method_code: "MPESA", amount: 3000, reference_number: "ABC" },
    ]);
  });

  it("rejects a batch that exceeds the sale remaining", () => {
    expect(() =>
      collectPaymentSplitsFromCheckoutBody(
        {
          pay_now: 10000,
          payment_splits: [
            { method_code: "CASH", amount: 7000 },
            { method_code: "MPESA", amount: 4000 },
          ],
        },
        10000,
      ),
    ).toThrow(/exceeds the amount due/);
  });

  it("rejects splits that do not match pay_now", () => {
    expect(() =>
      collectPaymentSplitsFromCheckoutBody(
        {
          pay_now: 5000,
          payment_splits: [{ method_code: "CASH", amount: 3000 }],
        },
        10000,
      ),
    ).toThrow(/do not add up/);
  });
});

describe("resolveCollectPaymentMethods", () => {
  it("fails before posting when a split method is missing", () => {
    expect(() =>
      resolveCollectPaymentMethods(
        [
          { method_code: "CASH", amount: 7000 },
          { method_code: "MPESA", amount: 3000 },
        ],
        [{ id: 1, method_code: "CASH" }],
      ),
    ).toThrow(/MPESA/);
  });

  it("resolves all methods when they are enabled", () => {
    const resolved = resolveCollectPaymentMethods(
      [
        { method_code: "CASH", amount: 7000 },
        { method_code: "MPESA", amount: 3000 },
      ],
      [
        { id: 1, method_code: "CASH" },
        { id: 2, method_code: "MPESA" },
      ],
    );
    expect(resolved.map((row) => row.payment_method_id)).toEqual([1, 2]);
  });
});
