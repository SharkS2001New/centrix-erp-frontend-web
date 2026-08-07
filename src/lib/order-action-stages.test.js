import { describe, expect, it } from "vitest";
import { isOrderEditVisible } from "@/lib/sales";
import {
  canCancelOrder,
  canRecordOrderPayment,
  isCustomerReturnAllowedForOrder,
  isPrintInvoiceVisible,
} from "@/lib/order-workflow";

/** Typical platform admin configuration from Order actions by stage. */
const PLATFORM_CAPS = {
  module_settings: {
    sales: {
      edit_order_statuses: ["booked", "pending"],
      print_invoice_statuses: ["paid", "processed", "delivered", "completed"],
      collect_payment_statuses: ["unpaid", "pending_payment"],
      cancel_order_statuses: ["booked", "pending"],
      customer_return_statuses: ["processed", "delivered", "completed"],
    },
  },
};

function sale(status, paymentStatus = "unpaid", amountPaid = 0) {
  return {
    status,
    payment_status: paymentStatus,
    order_total: 1000,
    amount_paid: amountPaid,
  };
}

describe("order actions by stage (platform config)", () => {
  it("edit only on Booked and Pending", () => {
    expect(isOrderEditVisible(sale("booked"), null, PLATFORM_CAPS)).toBe(true);
    expect(isOrderEditVisible(sale("pending"), null, PLATFORM_CAPS)).toBe(true);
    expect(isOrderEditVisible(sale("unpaid"), null, PLATFORM_CAPS)).toBe(false);
    expect(isOrderEditVisible(sale("paid"), null, PLATFORM_CAPS)).toBe(false);
  });

  it("print is always available for any order stage when staff request it", () => {
    expect(isPrintInvoiceVisible(sale("booked"), PLATFORM_CAPS)).toBe(true);
    expect(isPrintInvoiceVisible(sale("unpaid"), PLATFORM_CAPS)).toBe(true);
    expect(isPrintInvoiceVisible(sale("cancelled"), PLATFORM_CAPS)).toBe(true);
    expect(isPrintInvoiceVisible(sale("paid"), PLATFORM_CAPS)).toBe(true);
    expect(isPrintInvoiceVisible(sale("processed"), PLATFORM_CAPS)).toBe(true);
    expect(isPrintInvoiceVisible(sale("delivered"), PLATFORM_CAPS)).toBe(true);
    expect(isPrintInvoiceVisible(sale("completed"), PLATFORM_CAPS)).toBe(true);
  });

  it("collect payment only on Unpaid and Partially paid workflow stages", () => {
    expect(canRecordOrderPayment(sale("booked", "unpaid", 0), null, PLATFORM_CAPS)).toBe(false);
    expect(canRecordOrderPayment(sale("pending", "unpaid", 0), null, PLATFORM_CAPS)).toBe(false);
    expect(canRecordOrderPayment(sale("unpaid", "unpaid", 0), null, PLATFORM_CAPS)).toBe(true);
    expect(
      canRecordOrderPayment(sale("pending_payment", "partial", 400), null, PLATFORM_CAPS),
    ).toBe(true);
    expect(canRecordOrderPayment(sale("processed", "unpaid", 0), null, PLATFORM_CAPS)).toBe(true);
    expect(canRecordOrderPayment(sale("processed", "partial", 400), null, PLATFORM_CAPS)).toBe(true);
    expect(canRecordOrderPayment(sale("paid", "paid", 1000), null, PLATFORM_CAPS)).toBe(false);
  });

  it("ignores API can_collect_payment on booked when stages are unpaid/partial only", () => {
    expect(
      canRecordOrderPayment(
        { ...sale("booked", "unpaid", 0), can_collect_payment: true },
        null,
        PLATFORM_CAPS,
      ),
    ).toBe(false);
  });

  it("cancel only on Booked and Pending", () => {
    expect(canCancelOrder(sale("booked"), null, PLATFORM_CAPS)).toBe(true);
    expect(canCancelOrder(sale("pending"), null, PLATFORM_CAPS)).toBe(true);
    expect(canCancelOrder(sale("unpaid"), null, PLATFORM_CAPS)).toBe(false);
    expect(canCancelOrder(sale("paid"), null, PLATFORM_CAPS)).toBe(false);
  });

  it("cancel on Unpaid, Partially paid, and Paid when configured", () => {
    const caps = {
      module_settings: {
        sales: {
          order_cancellation_enabled: true,
          cancel_order_statuses: ["unpaid", "pending_payment", "paid"],
        },
      },
    };
    const workflow = {
      statuses: ["unpaid", "pending_payment", "paid"],
      pipeline: [
        { key: "unpaid", label: "Unpaid" },
        { key: "pending_payment", label: "Partially paid" },
        { key: "paid", label: "Paid" },
      ],
      labels: {
        unpaid: "Unpaid",
        pending_payment: "Partially paid",
        paid: "Paid",
      },
    };

    expect(canCancelOrder(sale("unpaid"), workflow, caps)).toBe(true);
    expect(canCancelOrder(sale("pending_payment", "partial", 400), workflow, caps)).toBe(true);
    expect(canCancelOrder(sale("paid", "paid", 1000), workflow, caps)).toBe(true);
    // Stored POS "completed" maps onto terminal Paid for short pipelines.
    expect(canCancelOrder(sale("completed", "paid", 1000), workflow, caps)).toBe(true);
    expect(canCancelOrder(sale("booked"), workflow, caps)).toBe(false);
  });

  it("cancel Paid covers POS completed when full pipeline still includes completed", () => {
    const caps = {
      module_settings: {
        sales: {
          order_cancellation_enabled: true,
          cancel_order_statuses: ["unpaid", "pending_payment", "paid"],
        },
      },
    };
    const fullPipeline = {
      statuses: [
        "booked",
        "pending",
        "unpaid",
        "pending_payment",
        "paid",
        "processed",
        "delivered",
        "completed",
      ],
      pipeline: [
        { key: "booked", label: "Booked" },
        { key: "pending", label: "Pending" },
        { key: "unpaid", label: "Unpaid" },
        { key: "pending_payment", label: "Partially paid" },
        { key: "paid", label: "Paid" },
        { key: "processed", label: "Processed" },
        { key: "delivered", label: "Delivered" },
        { key: "completed", label: "Completed" },
      ],
      labels: {
        booked: "Booked",
        pending: "Pending",
        unpaid: "Unpaid",
        pending_payment: "Partially paid",
        paid: "Paid",
        processed: "Processed",
        delivered: "Delivered",
        completed: "Completed",
      },
    };

    // Align keeps `completed` when that step is enabled — Cancel Paid must still match.
    expect(canCancelOrder(sale("completed", "paid", 1000), fullPipeline, caps)).toBe(true);
    expect(canCancelOrder(sale("paid", "paid", 1000), fullPipeline, caps)).toBe(true);
    expect(canCancelOrder(sale("unpaid", "unpaid", 0), fullPipeline, caps)).toBe(true);
    expect(canCancelOrder(sale("processed", "unpaid", 0), fullPipeline, caps)).toBe(true);
    expect(canCancelOrder(sale("processed", "partial", 400), fullPipeline, caps)).toBe(true);
    expect(canCancelOrder(sale("booked", "unpaid", 0), fullPipeline, caps)).toBe(false);
    expect(canCancelOrder(sale("processed", "paid", 1000), fullPipeline, caps)).toBe(true);
  });

  it("customer returns only on Processed, Delivered, Completed", () => {
    expect(isCustomerReturnAllowedForOrder(sale("booked"), PLATFORM_CAPS)).toBe(false);
    expect(isCustomerReturnAllowedForOrder(sale("paid"), PLATFORM_CAPS)).toBe(false);
    expect(isCustomerReturnAllowedForOrder(sale("processed"), PLATFORM_CAPS)).toBe(true);
    expect(isCustomerReturnAllowedForOrder(sale("delivered"), PLATFORM_CAPS)).toBe(true);
    expect(isCustomerReturnAllowedForOrder(sale("completed"), PLATFORM_CAPS)).toBe(true);
  });
});
