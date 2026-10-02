import { describe, expect, it } from "vitest";
import "@/lib/sales";
import {
  canRecordOrderPayment,
  DEFAULT_ORDER_WORKFLOW,
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

describe("unpaid / partial can advance to Processed without paying", () => {
  const workflow = DEFAULT_ORDER_WORKFLOW;

  it("offers Confirm → Processed from Pending while a balance remains", () => {
    const actions = resolveOrderWorkflowActions(
      {
        status: "pending",
        order_total: 4470,
        amount_paid: 0,
        payment_status: "unpaid",
      },
      workflow,
    );
    expect(actions.advanceStatus).toBe("processed");
  });

  it("offers Confirm → Processed from Unpaid even when amount_paid looks settled", () => {
    const actions = resolveOrderWorkflowActions(
      {
        status: "unpaid",
        order_total: 4730,
        amount_paid: 6010,
        payment_status: "paid",
        balance_due: 0,
      },
      workflow,
    );
    expect(actions.advanceStatus).toBe("processed");
  });

  it("offers Confirm → Processed from Unpaid while a balance remains", () => {
    const actions = resolveOrderWorkflowActions(
      {
        status: "unpaid",
        order_total: 4470,
        amount_paid: 0,
        payment_status: "unpaid",
      },
      workflow,
    );
    expect(actions.advanceStatus).toBe("processed");
  });

  it("offers Collect payment and Confirm → Processed together on unpaid / partial stages", () => {
    const caps = {
      module_settings: {
        sales: { collect_payment_statuses: ["unpaid", "pending_payment"] },
      },
    };
    const unpaid = resolveOrderWorkflowActions(
      {
        status: "unpaid",
        order_total: 4470,
        amount_paid: 0,
        payment_status: "unpaid",
      },
      workflow,
      null,
      caps,
    );
    expect(unpaid.showCollectPayment).toBe(true);
    expect(unpaid.advanceStatus).toBe("processed");

    const partial = resolveOrderWorkflowActions(
      {
        status: "pending_payment",
        order_total: 4470,
        amount_paid: 1000,
        payment_status: "partial",
      },
      workflow,
      null,
      caps,
    );
    expect(partial.showCollectPayment).toBe(true);
    expect(partial.advanceStatus).toBe("processed");
  });

  it("hides Collect payment when platform collect_payment_statuses exclude the stage", () => {
    const caps = {
      module_settings: {
        sales: { collect_payment_statuses: ["delivered"] },
      },
    };
    const actions = resolveOrderWorkflowActions(
      {
        status: "unpaid",
        order_total: 4470,
        amount_paid: 0,
        payment_status: "unpaid",
      },
      workflow,
      null,
      caps,
    );
    expect(actions.showCollectPayment).toBe(false);
    expect(actions.advanceStatus).toBe("processed");
  });

  it("offers Confirm → Processed from Partially paid while a balance remains", () => {
    const actions = resolveOrderWorkflowActions(
      {
        status: "pending_payment",
        order_total: 4470,
        amount_paid: 1000,
        payment_status: "partial",
      },
      workflow,
    );
    expect(actions.advanceStatus).toBe("processed");
  });

  it("offers Confirm → Processed from Paid so distribution can continue", () => {
    const actions = resolveOrderWorkflowActions(
      {
        status: "paid",
        order_total: 4470,
        amount_paid: 4470,
        payment_status: "paid",
      },
      workflow,
    );
    expect(actions.advanceStatus).toBe("processed");
  });

  it("shows Processed + Unpaid dual badge after fulfillment advance", () => {
    const sale = {
      status: "processed",
      order_total: 4470,
      amount_paid: 0,
      payment_status: "unpaid",
    };
    expect(shouldShowPaymentStatusBadge(sale)).toBe(true);
    expect(resolvePaymentStatusFromAmounts(sale)).toBe("unpaid");
  });
});
