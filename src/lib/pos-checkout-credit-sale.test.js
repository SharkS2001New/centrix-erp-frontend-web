import { describe, expect, it } from "vitest";
import {
  isCheckoutCreditSale,
  POS_CREDIT_CUSTOMER_REQUIRED_MESSAGE,
  POS_FULL_PAYMENT_REQUIRED_MESSAGE,
  validatePosDirectCheckoutPayment,
} from "@/lib/pos-checkout-credit-sale";

describe("validatePosDirectCheckoutPayment — External POS till", () => {
  it("requires full pay_now for non-credit sales", () => {
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: false,
        payNow: 400,
        amountDue: 500,
      }),
    ).toBe(POS_FULL_PAYMENT_REQUIRED_MESSAGE);
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: false,
        payNow: 100,
        amountDue: 100,
      }),
    ).toBeNull();
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: false,
        payNow: 100,
        amountDue: 105,
      }),
    ).toBe(POS_FULL_PAYMENT_REQUIRED_MESSAGE);
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: false,
        payNow: 3690,
        amountTendered: 3700,
        amountDue: 3690,
      }),
    ).toBeNull();
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: false,
        payNow: 3690,
        amountTendered: 3700,
        amountDue: 3695,
      }),
    ).toBeNull();
  });

  it("allows fully unpaid credit when customer_num is set", () => {
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: true,
        payNow: 0,
        amountDue: 500,
        customerNum: 42,
      }),
    ).toBeNull();
  });

  it("blocks credit without a registered customer", () => {
    expect(
      validatePosDirectCheckoutPayment({
        isCreditSale: true,
        payNow: 0,
        amountDue: 500,
      }),
    ).toBe(POS_CREDIT_CUSTOMER_REQUIRED_MESSAGE);
  });
});

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

  it("stays credit when tenders stay at zero (PageDown must not invent cash)", () => {
    // Regression: PageDown used to autofill cash to the bill, which made
    // amountPaid === total and flipped credit → paid.
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: true,
        amountPaid: 0,
        checkoutTotal: 1250,
      }),
    ).toBe(true);
    expect(
      isCheckoutCreditSale({
        hasCreditCustomer: true,
        amountPaid: 1250,
        checkoutTotal: 1250,
      }),
    ).toBe(false);
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
