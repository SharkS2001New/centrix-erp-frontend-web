import { describe, expect, it } from "vitest";
import "@/lib/sales";
import {
  canRecordOrderPayment,
  isPaymentGatedWorkflowTransition,
  resolveOrderWorkflowActions,
  saleBalanceDue,
  shouldShowPaymentStatusBadge,
  resolvePaymentStatusFromAmounts,
} from "@/lib/order-workflow";

describe("isPaymentGatedWorkflowTransition", () => {
  const unpaidDelivered = {
    status: "delivered",
    order_total: 900,
    amount_paid: 0,
    payment_status: "unpaid",
  };

  it("allows Delivered while a balance remains (fulfillment ≠ settlement)", () => {
    expect(isPaymentGatedWorkflowTransition(unpaidDelivered, "delivered")).toBe(false);
    expect(isPaymentGatedWorkflowTransition(
      { ...unpaidDelivered, status: "processed" },
      "delivered",
    )).toBe(false);
  });

  it("gates Completed until the order is fully paid", () => {
    expect(isPaymentGatedWorkflowTransition(unpaidDelivered, "completed")).toBe(true);
    expect(
      isPaymentGatedWorkflowTransition(
        { ...unpaidDelivered, amount_paid: 450, payment_status: "partial" },
        "completed",
      ),
    ).toBe(true);
    expect(
      isPaymentGatedWorkflowTransition(
        { ...unpaidDelivered, amount_paid: 900, payment_status: "paid" },
        "completed",
      ),
    ).toBe(false);
  });

  it("still gates Paid and unpaid→Partially paid", () => {
    expect(isPaymentGatedWorkflowTransition(unpaidDelivered, "paid")).toBe(true);
    expect(isPaymentGatedWorkflowTransition(unpaidDelivered, "pending_payment")).toBe(true);
  });
});

describe("saleBalanceDue", () => {
  it("uses Accounting balance_due when the API sent it", () => {
    expect(
      saleBalanceDue(
        { order_total: 99800, amount_paid: 99800, balance_due: 44800 },
        99800,
      ),
    ).toBe(44800);
  });

  it("falls back to order_total minus paid", () => {
    expect(saleBalanceDue({ order_total: 99800, amount_paid: 55000 })).toBe(44800);
  });
});

describe("completed orders with AR remaining", () => {
  const sale = {
    status: "completed",
    order_total: 99800,
    amount_paid: 55000,
    payment_status: "partial",
    balance_due: 44800,
    channel: "mobile",
  };

  it("does not treat Completed as a zero balance", () => {
    const actions = resolveOrderWorkflowActions(sale, { steps: [] }, null, null);
    expect(actions.balanceDue).toBe(44800);
  });

  it("shows a payment badge when Completed still has a balance", () => {
    expect(shouldShowPaymentStatusBadge(sale)).toBe(true);
    expect(resolvePaymentStatusFromAmounts(sale)).toBe("partial");
  });

  it("allows collecting the remaining AR on a completed order", () => {
    expect(canRecordOrderPayment(sale)).toBe(true);
  });
});
