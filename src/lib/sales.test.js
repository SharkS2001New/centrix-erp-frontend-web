import { describe, expect, it } from "vitest";
import {
  isOrderEditVisible,
  resolvePaymentMethodByCode,
  shouldOpenBackofficeOrderEdit,
  shouldRestoreOrderToCart,
} from "@/lib/sales";
import { canRecordOrderPayment, canCancelOrder, isPrintInvoiceVisible, orderActionStageOptionsFromWorkflow, workflowPipelineSteps } from "@/lib/order-workflow";

describe("resolvePaymentMethodByCode", () => {
  const methods = [
    { id: 1, method_code: "CASH", method_name: "Cash" },
    { id: 2, method_code: "MPESA", method_name: "M-Pesa" },
    { id: 3, method_code: "BANK", method_name: "Bank Transfer" },
    { id: 4, method_code: "CHEQUE", method_name: "Cheque" },
  ];

  it("resolves exact tender codes", () => {
    expect(resolvePaymentMethodByCode(methods, "CASH")?.id).toBe(1);
    expect(resolvePaymentMethodByCode(methods, "mpesa")?.id).toBe(2);
  });

  it("maps Equity/KCB/Other bank tenders onto BANK when dedicated rows are missing", () => {
    expect(resolvePaymentMethodByCode(methods, "EQUITY")?.id).toBe(3);
    expect(resolvePaymentMethodByCode(methods, "KCB")?.id).toBe(3);
    expect(resolvePaymentMethodByCode(methods, "OTHER")?.id).toBe(3);
  });

  it("returns null when no methods are loaded", () => {
    expect(resolvePaymentMethodByCode([], "CASH")).toBeNull();
  });
});

describe("sales order edit routing", () => {
  const mobileBookedSale = {
    id: 1,
    status: "booked",
    channel: "mobile",
    order_source: "mobile",
    can_edit: true,
    can_edit_lines: false,
  };

  const posBookedSale = {
    id: 2,
    status: "booked",
    channel: "pos",
    order_source: "pos",
    can_edit: true,
    can_edit_lines: false,
  };

  const capabilitiesWithPos = {
    modules: { sales: true, "sales.pos": true },
  };

  it("opens the line-edit popup for booked mobile orders", () => {
    expect(shouldOpenBackofficeOrderEdit(mobileBookedSale, null, capabilitiesWithPos)).toBe(true);
    expect(shouldRestoreOrderToCart(mobileBookedSale, null, capabilitiesWithPos)).toBe(false);
  });

  it("still restores external POS orders to cart", () => {
    expect(shouldOpenBackofficeOrderEdit(posBookedSale, null, capabilitiesWithPos)).toBe(false);
    expect(shouldRestoreOrderToCart(posBookedSale, null, capabilitiesWithPos)).toBe(true);
  });

  it("prefers the popup when can_edit_lines is true", () => {
    const sale = { ...posBookedSale, can_edit_lines: true };
    expect(shouldOpenBackofficeOrderEdit(sale, null, capabilitiesWithPos)).toBe(true);
    expect(shouldRestoreOrderToCart(sale, null, capabilitiesWithPos)).toBe(false);
  });
});

describe("order action stage gates", () => {
  it("gates edit visibility by configured edit_order_statuses", () => {
    const caps = {
      module_settings: {
        sales: { edit_order_statuses: ["unpaid"] },
      },
    };
    expect(isOrderEditVisible({ status: "unpaid" }, null, caps)).toBe(true);
    expect(isOrderEditVisible({ status: "booked" }, null, caps)).toBe(false);
  });

  it("allows print on all stages when print list is empty/null", () => {
    expect(isPrintInvoiceVisible({ status: "unpaid" })).toBe(true);
    expect(
      isPrintInvoiceVisible(
        { status: "unpaid" },
        { module_settings: { sales: { print_invoice_statuses: ["paid"] } } },
      ),
    ).toBe(false);
    expect(
      isPrintInvoiceVisible(
        { status: "paid" },
        { module_settings: { sales: { print_invoice_statuses: ["paid"] } } },
      ),
    ).toBe(true);
  });

  it("gates collect payment by stage plus outstanding balance", () => {
    const unpaidSale = {
      status: "unpaid",
      payment_status: "unpaid",
      order_total: 100,
      amount_paid: 0,
    };
    expect(canRecordOrderPayment(unpaidSale)).toBe(true);
    expect(
      canRecordOrderPayment(unpaidSale, null, {
        module_settings: { sales: { collect_payment_statuses: ["delivered"] } },
      }),
    ).toBe(false);
    expect(
      canRecordOrderPayment(
        { ...unpaidSale, status: "delivered", amount_paid: 100 },
        null,
        { module_settings: { sales: { collect_payment_statuses: ["delivered"] } } },
      ),
    ).toBe(false);
  });

  it("allows mobile channel when Mobile pseudo-stage is configured", () => {
    const caps = {
      module_settings: {
        sales: {
          order_cancellation_enabled: true,
          edit_order_statuses: ["mobile"],
          print_invoice_statuses: ["mobile"],
          collect_payment_statuses: ["mobile"],
          cancel_order_statuses: ["mobile"],
        },
      },
    };
    const mobileSale = {
      status: "booked",
      channel: "mobile",
      order_source: "mobile",
      payment_status: "unpaid",
      order_total: 100,
      amount_paid: 0,
    };
    expect(isOrderEditVisible(mobileSale, null, caps)).toBe(true);
    expect(isOrderEditVisible({ status: "booked", channel: "backend" }, null, caps)).toBe(false);
    expect(isPrintInvoiceVisible(mobileSale, caps)).toBe(true);
    expect(canRecordOrderPayment(mobileSale, null, caps)).toBe(true);
    expect(canCancelOrder(mobileSale, null, caps)).toBe(true);
  });
});

describe("orderActionStageOptionsFromWorkflow", () => {
  it("lists only enabled pipeline stages for the org", () => {
    const options = orderActionStageOptionsFromWorkflow({
      steps: [
        { status: "booked", label: "Booked", enabled: true },
        { status: "unpaid", label: "Unpaid", enabled: true },
        { status: "paid", label: "Paid", enabled: true },
        { status: "delivered", label: "Delivered", enabled: false },
      ],
    });

    expect(options.map((o) => o.value)).toEqual(["booked", "unpaid", "paid", "mobile"]);
  });

  it("reads enabled steps from saved order_workflow config", () => {
    const steps = workflowPipelineSteps({
      steps: [
        { status: "booked", label: "Reserved", enabled: true },
        { status: "paid", label: "Paid", enabled: true },
        { status: "delivered", label: "Delivered", enabled: false },
      ],
    });

    expect(steps.map((s) => s.key)).toEqual(["booked", "paid"]);
    expect(steps[0].label).toBe("Reserved");
  });
});
