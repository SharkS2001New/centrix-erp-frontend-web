import { describe, expect, it } from "vitest";
import {
  alignPaymentSplitsToPayNow,
  annotateSaleWithReceiptTenders,
  buildReceiptTenderSnapshot,
} from "@/lib/checkout-payment-splits";

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

  it("takes overpayment change from cash first (not proportional scale)", () => {
    const aligned = alignPaymentSplitsToPayNow(
      [
        { method_code: "CASH", amount: 700 },
        { method_code: "MPESA", amount: 500 },
      ],
      1000,
    );
    expect(aligned).toEqual([
      { method_code: "CASH", amount: 500 },
      { method_code: "MPESA", amount: 500 },
    ]);
  });

  it("keeps underpayment amounts as entered", () => {
    const aligned = alignPaymentSplitsToPayNow(
      [
        { method_code: "CASH", amount: 200 },
        { method_code: "MPESA", amount: 300 },
      ],
      1000,
    );
    expect(aligned).toEqual([
      { method_code: "CASH", amount: 200 },
      { method_code: "MPESA", amount: 300 },
    ]);
  });
});

describe("annotateSaleWithReceiptTenders", () => {
  it("overlays cashier-entered cash/mpesa and change onto the sale", () => {
    const sale = annotateSaleWithReceiptTenders(
      { id: 1, order_total: 1000, cash: 0, mpesa_amount: 0 },
      buildReceiptTenderSnapshot(
        { cashAmount: "700", mpesaAmount: "500" },
        { changeDue: 200, amountPaid: 1200 },
      ),
      1200,
    );
    expect(sale.cash).toBe(700);
    expect(sale.mpesa_amount).toBe(500);
    expect(sale._cash_tendered).toBe(1200);
    expect(sale._change_given).toBe(200);
    expect(sale.order_change).toBe(200);
  });
});
