import { describe, expect, it } from "vitest";
import { healOfflineCheckoutPayNow } from "./pos-offline";

describe("healOfflineCheckoutPayNow", () => {
  it("bumps stale pay_now up to the revised offline bill", () => {
    const body = {
      pay_now: 500,
      payment_splits: [{ method_code: "CASH", amount: 500 }],
      is_credit_sale: false,
    };
    healOfflineCheckoutPayNow(body, {
      sync_kind: "sale",
      sale_payload: {
        order_total: 750,
        amount_paid: 500,
        payment_status: "paid",
      },
    });
    expect(body.pay_now).toBe(750);
    expect(body.payment_splits).toEqual([{ method_code: "CASH", amount: 750 }]);
  });

  it("collapses stale under-total mixed splits to the replay payment method", () => {
    const body = {
      pay_now: 500,
      payment_method_code: "CASH",
      payment_reference: "SYNC-REF",
      payment_splits: [
        { method_code: "CASH", amount: 300 },
        { method_code: "MPESA", amount: 200, reference_number: "OLD-MPESA" },
      ],
      is_credit_sale: false,
    };
    healOfflineCheckoutPayNow(body, {
      sync_kind: "sale",
      sale_payload: {
        order_total: 750,
        amount_paid: 500,
        payment_status: "paid",
      },
    });
    expect(body.pay_now).toBe(750);
    expect(body.payment_splits).toEqual([
      { method_code: "CASH", amount: 750, reference_number: "SYNC-REF" },
    ]);
  });

  it("leaves credit sales alone", () => {
    const body = { pay_now: 0, is_credit_sale: true };
    healOfflineCheckoutPayNow(body, {
      sync_kind: "sale",
      sale_payload: { order_total: 900, payment_status: "unpaid" },
    });
    expect(body.pay_now).toBe(0);
  });
});
