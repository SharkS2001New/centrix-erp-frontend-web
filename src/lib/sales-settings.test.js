import { describe, expect, it } from "vitest";
import {
  applyDiscountApprovalFormUpdates,
  canApproveDiscountRequests,
  isDiscountApprovalEnabled,
  isDiscountApprovalEnabledForChannel,
  resolveCancelOrderStatuses,
  resolveCollectPaymentStatuses,
  resolveCustomerReturnStatuses,
  resolveEditOrderStatuses,
  resolvePrintInvoiceStatuses,
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

  it("shows POS line discount for ERP manual line without mobile approval", () => {
    const moduleSettings = {
      sales: {
        allow_discounts: false,
        allow_edit_line_discount: true,
        allow_pos_edit_line_discount: false,
        discount_approval_enabled_mobile: false,
        discount_approval_enabled_backoffice: false,
      },
    };
    expect(showPosLineDiscountField(moduleSettings)).toBe(true);
    expect(isDiscountApprovalEnabledForChannel(moduleSettings, "mobile")).toBe(false);
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
      "processed",
      "pending_approval",
      "editable",
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
  });
});
