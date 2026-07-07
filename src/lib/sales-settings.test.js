import { describe, expect, it } from "vitest";
import { canApproveDiscountRequests } from "@/lib/sales-settings";

describe("sales-settings discount approvals", () => {
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
