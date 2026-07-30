import { describe, expect, it } from "vitest";
import { alignPaymentSplitsToPayNow } from "@/lib/checkout-payment-splits";

describe("alignPaymentSplitsToPayNow", () => {
  it("adjusts the last split when totals differ slightly", () => {
    const aligned = alignPaymentSplitsToPayNow(
      [{ method_code: "CASH", amount: 9000 }],
      8998,
    );
    expect(aligned).toEqual([{ method_code: "CASH", amount: 8998 }]);
  });

  it("keeps mpesa and cash aligned to pay now plus cart mpesa", () => {
    const aligned = alignPaymentSplitsToPayNow(
      [
        { method_code: "CASH", amount: 4000 },
        { method_code: "MPESA", amount: 5000 },
      ],
      9000,
    );
    expect(aligned.reduce((sum, row) => sum + row.amount, 0)).toBe(9000);
  });
});
