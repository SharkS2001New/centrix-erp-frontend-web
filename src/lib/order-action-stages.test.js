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

  it("print only on Paid, Processed, Delivered, Completed", () => {
    expect(isPrintInvoiceVisible(sale("booked"), PLATFORM_CAPS)).toBe(false);
    expect(isPrintInvoiceVisible(sale("unpaid"), PLATFORM_CAPS)).toBe(false);
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
    expect(canRecordOrderPayment(sale("paid", "paid", 1000), null, PLATFORM_CAPS)).toBe(false);
  });

  it("cancel only on Booked and Pending", () => {
    expect(canCancelOrder(sale("booked"), null, PLATFORM_CAPS)).toBe(true);
    expect(canCancelOrder(sale("pending"), null, PLATFORM_CAPS)).toBe(true);
    expect(canCancelOrder(sale("unpaid"), null, PLATFORM_CAPS)).toBe(false);
    expect(canCancelOrder(sale("paid"), null, PLATFORM_CAPS)).toBe(false);
  });

  it("customer returns only on Processed, Delivered, Completed", () => {
    expect(isCustomerReturnAllowedForOrder(sale("booked"), PLATFORM_CAPS)).toBe(false);
    expect(isCustomerReturnAllowedForOrder(sale("paid"), PLATFORM_CAPS)).toBe(false);
    expect(isCustomerReturnAllowedForOrder(sale("processed"), PLATFORM_CAPS)).toBe(true);
    expect(isCustomerReturnAllowedForOrder(sale("delivered"), PLATFORM_CAPS)).toBe(true);
    expect(isCustomerReturnAllowedForOrder(sale("completed"), PLATFORM_CAPS)).toBe(true);
  });
});
