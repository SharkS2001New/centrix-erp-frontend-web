import { describe, expect, it } from "vitest";
import {
  applyDiscountApprovalFormUpdates,
  canApproveDiscountRequests,
  defaultBackofficeCheckoutOnCreate,
  getPosSalesConfig,
  isDiscountApprovalEnabled,
  isDiscountApprovalEnabledForChannel,
  loadingListNavHref,
  resolveCancelOrderStatuses,
  resolveCollectPaymentStatuses,
  resolveCustomerReturnStatuses,
  resolveEditOrderStatuses,
  resolveEnablePosCashRounding,
  resolveShowPosCheckoutOnCreate,
  resolvePrintInvoiceStatuses,
  shouldShowDistributionLoadingLists,
  shouldShowLoadingListNav,
  shouldShowMobileLoadingSheets,
  shouldShowSalesDiscountColumn,
  showBackofficeLineDiscountEdit,
  showPosLineDiscountField,
} from "@/lib/sales-settings";

describe("sales-settings discount approvals", () => {
  it("defaults discount approval to disabled on both channels", () => {
    expect(isDiscountApprovalEnabled({})).toBe(false);
    expect(isDiscountApprovalEnabledForChannel({}, "mobile")).toBe(false);
    expect(isDiscountApprovalEnabledForChannel({}, "backoffice")).toBe(false);
  });

  it("enables ERP manual line discounts only when backoffice approval is turned on", () => {
    expect(
      applyDiscountApprovalFormUpdates(
        {
          discount_approval_enabled: false,
          discount_approval_enabled_mobile: false,
          discount_approval_enabled_backoffice: false,
          allow_edit_line_discount: false,
          allow_pos_edit_line_discount: false,
        },
        { mobile: true, backoffice: false },
      ),
    ).toEqual({
      discount_approval_enabled: true,
      discount_approval_enabled_mobile: true,
      discount_approval_enabled_backoffice: false,
      allow_edit_line_discount: false,
      allow_pos_edit_line_discount: false,
    });
  });

  it("hides POS line discount when org discounts are disallowed", () => {
    const moduleSettings = {
      sales: {
        allow_discounts: false,
        allow_edit_line_discount: true,
        allow_pos_edit_line_discount: false,
        discount_approval_enabled_mobile: false,
        discount_approval_enabled_backoffice: false,
      },
    };
    expect(showPosLineDiscountField(moduleSettings)).toBe(false);
    expect(isDiscountApprovalEnabledForChannel(moduleSettings, "mobile")).toBe(false);
  });

  it("shows POS line discount when org discounts are allowed", () => {
    const moduleSettings = {
      sales: {
        allow_discounts: true,
        allow_edit_line_discount: false,
        allow_pos_edit_line_discount: false,
        discount_approval_enabled_mobile: false,
        discount_approval_enabled_backoffice: false,
      },
    };
    expect(showPosLineDiscountField(moduleSettings)).toBe(true);
  });

  it("unlocks POS line discounts when backoffice approval is enabled", () => {
    expect(
      applyDiscountApprovalFormUpdates(
        {
          discount_approval_enabled_mobile: false,
          discount_approval_enabled_backoffice: false,
          allow_edit_line_discount: false,
          allow_pos_edit_line_discount: false,
        },
        { mobile: false, backoffice: true },
      ).allow_pos_edit_line_discount,
    ).toBe(true);
  });

  it("keeps backoffice edit popup discounts when only mobile approval is on", () => {
    const moduleSettings = {
      sales: {
        allow_discounts: false,
        allow_edit_line_discount: false,
        allow_pos_edit_line_discount: false,
        discount_approval_enabled_mobile: true,
        discount_approval_enabled_backoffice: false,
      },
    };
    expect(showPosLineDiscountField(moduleSettings)).toBe(false);
    expect(
      showBackofficeLineDiscountEdit(moduleSettings, {
        hasPermission: () => false,
        sale: { status: "editable", can_edit_lines: true },
      }),
    ).toBe(true);
  });

  it("respects per-channel enablement from module settings", () => {
    const moduleSettings = {
      sales: {
        discount_approval_enabled_mobile: true,
        discount_approval_enabled_backoffice: false,
      },
    };
    expect(isDiscountApprovalEnabled(moduleSettings)).toBe(true);
    expect(isDiscountApprovalEnabledForChannel(moduleSettings, "mobile")).toBe(true);
    expect(isDiscountApprovalEnabledForChannel(moduleSettings, "backoffice")).toBe(false);
  });

  it("uses approval_permissions.discount_requests from capabilities", () => {
    expect(
      canApproveDiscountRequests({
        hasPermission: () => false,
        capabilities: { approval_permissions: { discount_requests: true } },
      }),
    ).toBe(true);
  });

  it("falls back to admin.discount_approvals.approve permission", () => {
    expect(
      canApproveDiscountRequests({
        hasPermission: (code) => code === "admin.discount_approvals.approve",
      }),
    ).toBe(true);
  });
});

describe("sales-settings order action stages", () => {
  it("defaults edit / print / collect status lists", () => {
    expect(resolveEditOrderStatuses(null)).toEqual(["booked", "pending", "editable"]);
    expect(resolvePrintInvoiceStatuses(null)).toBeNull();
    expect(resolveCollectPaymentStatuses(null)).toEqual(["unpaid", "pending_payment"]);
    expect(resolveCancelOrderStatuses(null)).toEqual([
      "booked",
      "pending",
      "unpaid",
      "pending_payment",
      "paid",
      "processed",
      "delivered",
      "completed",
    ]);
    expect(resolveCustomerReturnStatuses(null)).toEqual([
      "paid",
      "processed",
      "delivered",
      "completed",
    ]);
  });

  it("uses configured lists and treats empty print as all stages", () => {
    expect(
      resolveEditOrderStatuses({
        edit_order_statuses: ["unpaid", "bogus", "unpaid"],
      }),
    ).toEqual(["unpaid"]);
    expect(
      resolvePrintInvoiceStatuses({
        print_invoice_statuses: ["paid", "completed"],
      }),
    ).toEqual(["paid", "completed"]);
    expect(resolvePrintInvoiceStatuses({ print_invoice_statuses: [] })).toBeNull();
    expect(
      resolveCollectPaymentStatuses({
        collect_payment_statuses: ["delivered"],
      }),
    ).toEqual(["delivered"]);
    expect(
      resolveCancelOrderStatuses({
        cancel_order_statuses: ["paid"],
      }),
    ).toEqual(["paid"]);
    expect(
      resolveCustomerReturnStatuses({
        customer_return_statuses: ["delivered"],
      }),
    ).toEqual(["delivered"]);
    expect(
      resolveEditOrderStatuses({
        edit_order_statuses: ["mobile", "bogus"],
      }),
    ).toEqual(["mobile"]);
  });
});

describe("sales-settings POS cash rounding", () => {
  it("defaults off for modern layout when the flag is unset", () => {
    expect(resolveEnablePosCashRounding({ sales: { external_pos_layout: "modern" } })).toBe(
      false,
    );
    expect(getPosSalesConfig({ sales: {} }).enablePosCashRounding).toBe(false);
  });

  it("keeps classic layout rounding on when the flag is unset (legacy)", () => {
    expect(
      resolveEnablePosCashRounding({ sales: { external_pos_layout: "classic" } }),
    ).toBe(true);
  });

  it("honours an explicit platform flag for both layouts", () => {
    expect(
      resolveEnablePosCashRounding({
        sales: { external_pos_layout: "modern", enable_pos_cash_rounding: true },
      }),
    ).toBe(true);
    expect(
      resolveEnablePosCashRounding({
        sales: { external_pos_layout: "classic", enable_pos_cash_rounding: false },
      }),
    ).toBe(false);
  });
});

describe("sales-settings checkout on create (POS vs backoffice)", () => {
  it("defaults distribution backoffice to save order", () => {
    expect(defaultBackofficeCheckoutOnCreate("distribution")).toBe(false);
    expect(defaultBackofficeCheckoutOnCreate("wholesale_retail")).toBe(true);
    expect(defaultBackofficeCheckoutOnCreate("supermarket")).toBe(true);
    expect(defaultBackofficeCheckoutOnCreate("small_shop")).toBe(true);
  });

  it("splits standalone external POS from backoffice Create order", () => {
    const moduleSettings = {
      sales: {
        show_checkout_on_create_order: false,
        show_pos_checkout_on_create: true,
      },
    };
    expect(getPosSalesConfig(moduleSettings, { standalone: true }).showCheckoutOnCreate).toBe(
      true,
    );
    expect(getPosSalesConfig(moduleSettings, { standalone: false }).showCheckoutOnCreate).toBe(
      false,
    );
  });

  it("falls back to legacy shared flag for external POS when unset", () => {
    expect(
      resolveShowPosCheckoutOnCreate({
        sales: { show_checkout_on_create_order: false },
      }),
    ).toBe(false);
    expect(
      resolveShowPosCheckoutOnCreate({
        sales: { show_checkout_on_create_order: true },
      }),
    ).toBe(true);
  });
});

describe("shouldShowSalesDiscountColumn", () => {
  it("hides the column when product discounts are off even if edit-line defaults merge as true", () => {
    expect(
      shouldShowSalesDiscountColumn({
        sales: {
          allow_discounts: false,
          discount_approval_enabled_mobile: false,
          discount_approval_enabled_backoffice: false,
          enable_order_discount: false,
        },
      }),
    ).toBe(false);
  });

  it("shows the column when product discounts or approval is enabled", () => {
    expect(shouldShowSalesDiscountColumn({ sales: { allow_discounts: true } })).toBe(true);
    expect(
      shouldShowSalesDiscountColumn({
        sales: {
          allow_discounts: false,
          discount_approval_enabled_mobile: true,
        },
      }),
    ).toBe(true);
  });
});

describe("sales-settings mobile loading sheets", () => {
  const mobileCaps = {
    modules: { "sales.mobile": true, distribution: false },
    module_settings: { sales: { enable_mobile_orders: true } },
    distribution_ops_enabled: false,
  };

  it("shows field-sales loading sheets when mobile is on and distribution ops are off", () => {
    expect(shouldShowMobileLoadingSheets(mobileCaps)).toBe(true);
    expect(shouldShowLoadingListNav(mobileCaps)).toBe(true);
    expect(loadingListNavHref(mobileCaps)).toBe("/sales/loading-sheets");
  });

  it("hides field-sales loading sheets when distribution ops are enabled", () => {
    const caps = {
      ...mobileCaps,
      modules: { ...mobileCaps.modules, distribution: true },
      distribution_ops_enabled: true,
    };
    expect(shouldShowMobileLoadingSheets(caps)).toBe(false);
    expect(shouldShowDistributionLoadingLists(caps)).toBe(true);
    expect(loadingListNavHref(caps)).toBe("/fulfillment/loading-lists");
  });

  it("hides loading sheets when mobile module or orders are off", () => {
    expect(
      shouldShowMobileLoadingSheets({
        ...mobileCaps,
        modules: { "sales.mobile": false, distribution: false },
      }),
    ).toBe(false);
    expect(
      shouldShowMobileLoadingSheets({
        ...mobileCaps,
        module_settings: { sales: { enable_mobile_orders: false } },
      }),
    ).toBe(false);
  });
});
