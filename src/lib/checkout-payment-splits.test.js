import { describe, expect, it } from "vitest";
import {
  alignPaymentSplitsToPayNow,
  annotateSaleWithReceiptTenders,
  buildReceiptTenderSnapshot,
  isPosCashChangeExcessive,
  MAX_POS_CASH_CHANGE,
  posCashChangeDue,
  resolveSaleReceiptChangeGiven,
  resolveSaleReceiptTopupAmount,
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

  it("takes overpayment from a bank or mpesa-only tender", () => {
    for (const method of ["MPESA", "EQUITY", "KCB"]) {
      const aligned = alignPaymentSplitsToPayNow(
        [{ method_code: method, amount: 620 }],
        520,
      );
      expect(aligned).toEqual([{ method_code: method, amount: 520 }]);
    }
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

  it("does not invent change from top-up tender vs full order total", () => {
    const sale = annotateSaleWithReceiptTenders(
      {
        id: 1,
        order_total: 1500,
        cash: 1000,
        mpesa_amount: 0,
        payment_adjustments: [
          { adjustment_type: "topup", method_code: "CASH", amount: 500 },
        ],
      },
      buildReceiptTenderSnapshot(
        { cashAmount: "500" },
        { changeDue: 0, amountPaid: 500 },
      ),
      500,
    );
    expect(sale.cash).toBe(1000);
    expect(sale._change_given).toBeUndefined();
    expect(sale.order_change).toBe(0);
  });

  it("stamps exact return amount as change for previous-order edit", () => {
    const sale = annotateSaleWithReceiptTenders(
      {
        id: 1,
        order_total: 800,
        cash: 1200,
        payment_adjustments: [
          { adjustment_type: "return", method_code: "CASH", amount: 200 },
        ],
      },
      buildReceiptTenderSnapshot(
        { cashAmount: "200" },
        { changeDue: 0, amountPaid: 200 },
      ),
      200,
    );
    expect(sale.cash).toBe(1200);
    expect(sale._change_given).toBe(200);
    expect(sale.order_change).toBe(200);
  });

  it("keeps exact cash pay as Cash = Total with no change", () => {
    const sale = annotateSaleWithReceiptTenders(
      { id: 1, order_total: 39670, cash: 39670 },
      buildReceiptTenderSnapshot(
        { cashAmount: "39670" },
        { changeDue: 0, amountPaid: 39670 },
      ),
      39670,
    );
    expect(sale.cash).toBe(39670);
    expect(sale._cash_tendered).toBe(39670);
    expect(sale._change_given).toBeUndefined();
    expect(sale.order_change ?? 0).toBe(0);
  });

  it("shows real cash overpayment within the allowed change band", () => {
    const sale = annotateSaleWithReceiptTenders(
      { id: 1, order_total: 39670, cash: 39670 },
      buildReceiptTenderSnapshot(
        { cashAmount: "40000" },
        { changeDue: 330, amountPaid: 40000 },
      ),
      40000,
    );
    expect(sale.cash).toBe(40000);
    expect(sale._change_given).toBe(330);
  });
});

describe("isPosCashChangeExcessive", () => {
  it("allows change up to the max", () => {
    expect(isPosCashChangeExcessive(50000, 40000, 10000)).toBe(false);
    expect(isPosCashChangeExcessive(50000, 40000)).toBe(false);
  });

  it("blocks change above the max (e.g. accidental 2× tender)", () => {
    expect(isPosCashChangeExcessive(79340, 39670)).toBe(true);
    expect(posCashChangeDue(79340, 39670)).toBe(39670);
    expect(MAX_POS_CASH_CHANGE).toBe(10000);
  });
});

describe("resolveSaleReceiptChangeGiven", () => {
  it("uses exact return adjustment and ignores inflated tender math", () => {
    const change = resolveSaleReceiptChangeGiven(
      {
        order_total: 800,
        cash: 1200,
        payment_adjustments: [
          { adjustment_type: "return", method_code: "CASH", amount: 200 },
        ],
      },
      { totalPaid: 1200, orderTotal: 800 },
    );
    expect(change).toBe(200);
  });

  it("shows no change for top-up even when tenders exceed order total", () => {
    const change = resolveSaleReceiptChangeGiven(
      {
        order_total: 1100,
        cash: 1300,
        payment_adjustments: [
          { adjustment_type: "topup", method_code: "CASH", amount: 100 },
        ],
      },
      { totalPaid: 1300, orderTotal: 1100 },
    );
    expect(change).toBe(0);
  });

  it("falls back to normal tender change when there are no adjustments", () => {
    const change = resolveSaleReceiptChangeGiven(
      { order_total: 1000, cash: 700, mpesa_amount: 500, _cash_tendered: 1200 },
      { totalPaid: 1200, orderTotal: 1000 },
    );
    expect(change).toBe(200);
  });
});

describe("resolveSaleReceiptTopupAmount", () => {
  it("hides top-up when Cash already shows the full revised total", () => {
    // Previous-order edit: prior 145 + top-up 160 → Cash 305, Total 305.
    // Printing Top-up 160 on top looks like the customer paid 465.
    const topup = resolveSaleReceiptTopupAmount(
      {
        order_total: 305,
        cash: 305,
        _topup_amount: 160,
        payment_adjustments: [
          { adjustment_type: "topup", method_code: "CASH", amount: 160 },
        ],
      },
      { totalPaid: 305, orderTotal: 305 },
    );
    expect(topup).toBe(0);
  });

  it("still surfaces top-up when tenders do not yet cover the bill", () => {
    const topup = resolveSaleReceiptTopupAmount(
      {
        order_total: 1100,
        cash: 900,
        payment_adjustments: [
          { adjustment_type: "topup", method_code: "CASH", amount: 200 },
        ],
      },
      { totalPaid: 900, orderTotal: 1100 },
    );
    expect(topup).toBe(200);
  });
});
