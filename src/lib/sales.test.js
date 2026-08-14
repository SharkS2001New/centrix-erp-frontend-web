import { describe, expect, it } from "vitest";
import {
  formatCashSalesNumber,
  formatPaymentsBreakdownOrderLabel,
  isOrderEditActionVisible,
  isOrderEditVisible,
  resolvePaymentMethodByCode,
  resolveFreshWorkspacePosNum,
  resolvePosBrowseNumber,
  resolvePosNextBrowseNumber,
  resolvePosSessionTicketNumber,
  shouldOpenBackofficeOrderEdit,
  shouldRestoreOrderToCart,
} from "@/lib/sales";
import {
  canRecordOrderPayment,
  canCollectPaymentOnQueue,
  canCancelOrder,
  isPrintInvoiceVisible,
  isPrintProformaVisible,
  orderActionStageOptionsFromWorkflow,
  resolveSalesOrderQueue,
  workflowPipelineSteps,
} from "@/lib/order-workflow";

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

  it("restores booked mobile orders to cart when line edit is not allowed", () => {
    expect(shouldOpenBackofficeOrderEdit(mobileBookedSale, null, capabilitiesWithPos)).toBe(false);
    expect(shouldRestoreOrderToCart(mobileBookedSale, null, capabilitiesWithPos)).toBe(true);
  });

  it("restores booked POS orders to cart when line edit is not allowed", () => {
    expect(shouldOpenBackofficeOrderEdit(posBookedSale, null, capabilitiesWithPos)).toBe(false);
    expect(shouldRestoreOrderToCart(posBookedSale, null, capabilitiesWithPos)).toBe(true);
  });

  it("hides line edit when backoffice order editing is disabled in platform settings", () => {
    const caps = {
      ...capabilitiesWithPos,
      module_settings: { sales: { enable_backoffice_order_edit: false } },
    };
    const sale = { ...posBookedSale, can_edit_lines: true };
    expect(shouldOpenBackofficeOrderEdit(sale, null, caps)).toBe(false);
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

  it("does not show Edit Order on completed/processed even when API can_edit is true", () => {
    const caps = {
      module_settings: {
        sales: { edit_order_statuses: ["booked", "pending", "editable"] },
      },
    };
    const completedBackoffice = {
      status: "completed",
      channel: "backend",
      order_source: "backoffice",
      can_edit: true,
      can_edit_lines: true,
    };
    const processedMobile = {
      status: "processed",
      channel: "mobile",
      order_source: "mobile",
      can_edit: true,
      can_edit_lines: false,
    };
    expect(isOrderEditVisible(completedBackoffice, null, caps)).toBe(false);
    expect(shouldOpenBackofficeOrderEdit(completedBackoffice, null, caps)).toBe(false);
    expect(isOrderEditActionVisible(completedBackoffice, null, caps)).toBe(false);
    expect(isOrderEditActionVisible(processedMobile, null, caps)).toBe(false);

    const bookedBackoffice = {
      status: "booked",
      channel: "backend",
      order_source: "backoffice",
      can_edit: true,
      can_edit_lines: true,
    };
    expect(isOrderEditActionVisible(bookedBackoffice, null, caps)).toBe(true);
  });

  it("allows print on all stages including unpaid and cancelled", () => {
    expect(isPrintInvoiceVisible({ status: "unpaid" })).toBe(true);
    expect(
      isPrintInvoiceVisible(
        { status: "unpaid" },
        { module_settings: { sales: { print_invoice_statuses: ["paid"] } } },
      ),
    ).toBe(true);
    expect(
      isPrintInvoiceVisible(
        { status: "cancelled" },
        { module_settings: { sales: { print_invoice_statuses: ["paid"] } } },
      ),
    ).toBe(true);
    expect(
      isPrintInvoiceVisible(
        { status: "paid" },
        { module_settings: { sales: { print_invoice_statuses: ["paid"] } } },
      ),
    ).toBe(true);
  });

  it("allows proforma only for fully unpaid active orders", () => {
    expect(
      isPrintProformaVisible({
        status: "booked",
        payment_status: "unpaid",
        order_total: 1000,
        amount_paid: 0,
      }),
    ).toBe(true);
    expect(
      isPrintProformaVisible({
        status: "unpaid",
        order_total: 1000,
        amount_paid: 0,
      }),
    ).toBe(true);
    expect(
      isPrintProformaVisible({
        status: "processed",
        payment_status: "partial",
        order_total: 1000,
        amount_paid: 400,
      }),
    ).toBe(false);
    expect(
      isPrintProformaVisible({
        status: "paid",
        payment_status: "paid",
        order_total: 1000,
        amount_paid: 1000,
      }),
    ).toBe(false);
    expect(
      isPrintProformaVisible({
        status: "cancelled",
        payment_status: "unpaid",
        order_total: 1000,
        amount_paid: 0,
      }),
    ).toBe(false);
    expect(
      isPrintProformaVisible({
        status: "draft",
        order_total: 1000,
        amount_paid: 0,
      }),
    ).toBe(false);
  });

  it("hides proforma when Printouts org option is disabled", () => {
    const unpaid = {
      status: "booked",
      payment_status: "unpaid",
      order_total: 1000,
      amount_paid: 0,
    };
    expect(isPrintProformaVisible(unpaid, null, null)).toBe(true);
    expect(
      isPrintProformaVisible(unpaid, null, {
        module_settings: { sales: { show_print_proforma_invoice_option: true } },
      }),
    ).toBe(true);
    expect(
      isPrintProformaVisible(unpaid, null, {
        module_settings: { sales: { show_print_proforma_invoice_option: false } },
      }),
    ).toBe(false);
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

  it("does not allow collect payment on booked orders when only unpaid stages are enabled", () => {
    const caps = {
      module_settings: {
        sales: { collect_payment_statuses: ["unpaid", "pending_payment"] },
      },
    };
    const bookedUnpaid = {
      status: "booked",
      payment_status: "unpaid",
      order_total: 500,
      amount_paid: 0,
      can_collect_payment: true,
    };
    expect(canRecordOrderPayment(bookedUnpaid, null, caps)).toBe(false);

    const unpaidStage = {
      status: "unpaid",
      payment_status: "unpaid",
      order_total: 500,
      amount_paid: 0,
      can_collect_payment: true,
    };
    expect(canRecordOrderPayment(unpaidStage, null, caps)).toBe(true);

    const partialStage = {
      status: "pending_payment",
      payment_status: "partial",
      order_total: 500,
      amount_paid: 200,
      can_collect_payment: true,
    };
    expect(canRecordOrderPayment(partialStage, null, caps)).toBe(true);

    const processedUnpaid = {
      status: "processed",
      payment_status: "unpaid",
      order_total: 500,
      amount_paid: 0,
    };
    expect(canRecordOrderPayment(processedUnpaid, null, caps)).toBe(true);
  });

  it("shows collect payment only on unpaid and partially paid queue pages", () => {
    const caps = {
      module_settings: {
        sales: { collect_payment_statuses: ["unpaid", "pending_payment"] },
      },
    };
    const unpaidSale = {
      status: "unpaid",
      payment_status: "unpaid",
      order_total: 500,
      amount_paid: 0,
    };
    const processedUnpaid = {
      status: "processed",
      payment_status: "unpaid",
      order_total: 500,
      amount_paid: 0,
    };

    expect(canCollectPaymentOnQueue(unpaidSale, "booked", null, caps)).toBe(false);
    expect(canCollectPaymentOnQueue(unpaidSale, "all", null, caps)).toBe(false);
    expect(canCollectPaymentOnQueue(unpaidSale, "unpaid", null, caps)).toBe(true);
    expect(canCollectPaymentOnQueue(processedUnpaid, "unpaid", null, caps)).toBe(true);
    expect(canCollectPaymentOnQueue(processedUnpaid, "pending_payment", null, caps)).toBe(true);
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

describe("resolveSalesOrderQueue", () => {
  const pipeline = {
    pipeline: [
      { key: "booked", label: "Booked" },
      { key: "unpaid", label: "Unpaid" },
      { key: "pending_payment", label: "Partially paid" },
      { key: "processed", label: "Processed" },
    ],
  };

  const distributionCaps = {
    modules: { distribution: true },
    distribution_ops_enabled: true,
    module_settings: { sales: { show_checkout_on_create_order: false } },
  };

  it("distribution unpaid queue includes unpaid + fulfillment stages, not booked/pending", () => {
    const config = resolveSalesOrderQueue("unpaid", pipeline, { capabilities: distributionCaps });

    expect(config?.fixedPaymentStatusFilter).toBe("unpaid");
    expect(config?.fixedStatusFilter).toBeNull();
    expect(config?.includeStatuses).toEqual(["unpaid", "processed"]);
    expect(config?.excludeStatuses).toEqual(
      expect.arrayContaining(["booked", "pending", "cancelled", "expired", "completed"]),
    );
    expect(config?.requireOutstandingBalance).toBe(true);
  });

  it("mobile queue excludes cancelled orders", () => {
    const config = resolveSalesOrderQueue("mobile", pipeline, { includeMobile: true });
    expect(config?.fixedSourceFilter).toBe("mobile");
    expect(config?.excludeStatuses).toEqual(["cancelled"]);
  });

  it("distribution pending_payment queue includes partial + fulfillment stages", () => {
    const config = resolveSalesOrderQueue("pending_payment", pipeline, {
      capabilities: distributionCaps,
    });

    expect(config?.fixedPaymentStatusFilter).toBe("partial");
    expect(config?.includeStatuses).toEqual(["pending_payment", "processed"]);
    expect(config?.fixedStatusFilter).toBeNull();
  });

  it("retail unpaid queue filters by payment amounts, not workflow stage alone", () => {
    const config = resolveSalesOrderQueue("unpaid", pipeline, {
      capabilities: { modules: { sales: true } },
    });

    expect(config?.fixedStatusFilter).toBeNull();
    expect(config?.fixedPaymentStatusFilter).toBe("unpaid");
    expect(config?.requireOutstandingBalance).toBe(true);
    expect(config?.excludeStatuses).toEqual(["cancelled", "expired"]);
  });

  it("retail pending_payment queue filters by partial amounts", () => {
    const config = resolveSalesOrderQueue("pending_payment", pipeline, {
      capabilities: { modules: { sales: true } },
    });

    expect(config?.fixedStatusFilter).toBeNull();
    expect(config?.fixedPaymentStatusFilter).toBe("partial");
    expect(config?.requireOutstandingBalance).toBe(true);
  });

  it("retail paid queue filters by fully paid amounts (matches X/Z ORDTTL)", () => {
    const pipelineWithPaid = {
      pipeline: [
        { key: "booked", label: "Booked" },
        { key: "unpaid", label: "Unpaid" },
        { key: "pending_payment", label: "Partially paid" },
        { key: "paid", label: "Paid" },
        { key: "processed", label: "Processed" },
      ],
    };
    const config = resolveSalesOrderQueue("paid", pipelineWithPaid, {
      capabilities: { modules: { sales: true } },
    });

    expect(config?.fixedStatusFilter).toBeNull();
    expect(config?.fixedPaymentStatusFilter).toBe("paid");
    expect(config?.requireOutstandingBalance).toBe(false);
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

describe("formatCashSalesNumber", () => {
  it("uses pos_order_num for POS channel sales", () => {
    expect(
      formatCashSalesNumber({ channel: "pos", pos_order_num: 6, order_num: 33 }),
    ).toBe("6");
  });

  it("falls back to next_pos_order_num when pos_order_num is missing", () => {
    expect(
      formatCashSalesNumber({ channel: "pos", next_pos_order_num: 6, order_num: 33 }),
    ).toBe("6");
  });

  it("does not fall back to S00xx for POS channel", () => {
    expect(formatCashSalesNumber({ channel: "pos", order_num: 33 })).toBe("—");
  });
});

describe("formatPaymentsBreakdownOrderLabel", () => {
  it("shows system order then POS cash sales number", () => {
    expect(
      formatPaymentsBreakdownOrderLabel({ order_num: 33, pos_order_num: 6 }),
    ).toBe("S0033 → 6");
  });

  it("falls back to system order when POS ticket is missing", () => {
    expect(formatPaymentsBreakdownOrderLabel({ order_num: 33 })).toBe("S0033");
  });
});

describe("resolvePosSessionTicketNumber", () => {
  it("returns only the daily POS ticket", () => {
    expect(resolvePosSessionTicketNumber({ pos_order_num: 4, order_num: 7801 })).toBe(4);
    expect(resolvePosSessionTicketNumber({ order_num: 7801 })).toBeNull();
  });
});

describe("resolvePosNextBrowseNumber", () => {
  it("returns only the daily POS next ticket", () => {
    expect(
      resolvePosNextBrowseNumber({ next_pos_order_num: 8, next_order_num: 36 }),
    ).toBe(8);
  });

  it("does not fall back to org next_order_num", () => {
    expect(resolvePosNextBrowseNumber({ next_order_num: 36 })).toBeNull();
  });
});

describe("resolvePosBrowseNumber", () => {
  it("does not use next_order_num for new-order peeks", () => {
    expect(resolvePosBrowseNumber({ next_order_num: 36 })).toBeNull();
    expect(
      resolvePosBrowseNumber({ next_pos_order_num: 8, next_order_num: 36 }),
    ).toBe(8);
  });

  it("does not fall back to org order_num on session rows", () => {
    expect(resolvePosBrowseNumber({ order_num: 7801, channel: "pos" })).toBeNull();
    expect(resolvePosBrowseNumber({ pos_order_num: 5, order_num: 7801 })).toBe(5);
  });
});

describe("resolveFreshWorkspacePosNum", () => {
  it("does not skip a ticket when holding or F8-clearing an open cart that only has next_pos_order_num", () => {
    const sessionOrders = [{ pos_order_num: 9, float_session_id: 4 }];
    const openCart = {
      lines: [{ product_code: "A", quantity: 1 }],
      next_pos_order_num: 10,
      float_session_id: 4,
    };
    expect(resolveFreshWorkspacePosNum(openCart, sessionOrders, null, null, 4)).toBe(10);
  });

  it("advances after a checkout cart that already claimed pos_order_num", () => {
    const sessionOrders = [{ pos_order_num: 9, float_session_id: 4 }];
    const checkoutCart = {
      lines: [{ product_code: "A", quantity: 1 }],
      pos_order_num: 10,
      next_pos_order_num: 10,
      float_session_id: 4,
    };
    expect(
      resolveFreshWorkspacePosNum(checkoutCart, sessionOrders, checkoutCart, null, 4),
    ).toBe(11);
  });

  it("uses pendingSale ticket when the workspace cart has not been stamped yet", () => {
    const sessionOrders = [{ pos_order_num: 9, float_session_id: 4 }];
    const openCart = {
      lines: [{ product_code: "A", quantity: 1 }],
      next_pos_order_num: 10,
      float_session_id: 4,
    };
    const pendingSale = { pos_order_num: 10, float_session_id: 4 };
    expect(resolveFreshWorkspacePosNum(openCart, sessionOrders, pendingSale, null, 4)).toBe(11);
  });
});
