import { describe, expect, it } from "vitest";
import { isCheckoutCreditSale } from "@/lib/pos-checkout-credit-sale";

describe("isCheckoutCreditSale (I then C/M/E/K)", () => {
  it("is credit when invoice customer selected and unpaid", () => {
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: true,
        amountPaid: 0,
        checkoutTotal: 500,
      }),
    ).toBe(true);
  });

  it("is credit when invoice customer selected and partially paid", () => {
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: true,
        amountPaid: 100,
        checkoutTotal: 500,
      }),
    ).toBe(true);
  });

  it("is not credit when cashier pays in full after opening I", () => {
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: true,
        amountPaid: 500,
        checkoutTotal: 500,
      }),
    ).toBe(false);
  });

  it("is not credit when overpaying cash after opening I", () => {
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: true,
        amountPaid: 600,
        checkoutTotal: 500,
      }),
    ).toBe(false);
  });

  it("is not credit without a credit customer", () => {
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: false,
        amountPaid: 0,
        checkoutTotal: 500,
      }),
    ).toBe(false);
  });
});
