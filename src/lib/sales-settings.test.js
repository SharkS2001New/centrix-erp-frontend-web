import { describe, expect, it } from "vitest";
import {
  applyDiscountApprovalFormUpdates,
  canApproveDiscountRequests,
  isDiscountApprovalEnabled,
} from "@/lib/sales-settings";

describe("sales-settings discount approvals", () => {
  it("defaults discount approval to enabled", () => {
    expect(isDiscountApprovalEnabled({})).toBe(true);
  });

  it("enables manual line discounts when discount approval is turned on", () => {
    expect(
      applyDiscountApprovalFormUpdates(
        {
          discount_approval_enabled: false,
          allow_edit_line_discount: false,
          allow_pos_edit_line_discount: false,
        },
        true,
      ),
    ).toEqual({
      discount_approval_enabled: true,
      allow_edit_line_discount: true,
      allow_pos_edit_line_discount: true,
    });
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
