import { describe, expect, it } from "vitest";
import { resolveNotificationLinkAccess } from "@/lib/notification-action-url";

const platformShellContext = {
  user: { is_super_admin: true },
  organization: { company_code: "PLATFORM" },
  capabilities: { workspaces: [] },
  isSuperAdmin: () => true,
};

describe("resolveNotificationLinkAccess", () => {
  it.each(["/platform/organizations/123", "/platform/system-issues"])(
    "allows platform shell notifications to open %s without a tenant workspace",
    (actionUrl) => {
      expect(
        resolveNotificationLinkAccess(actionUrl, {
          capabilities: platformShellContext.capabilities,
          ctx: platformShellContext,
        }),
      ).toMatchObject({
        canOpen: true,
        normalizedUrl: actionUrl,
        message: null,
        targetWorkspaceId: null,
      });
    },
  );

  it("does not allow platform shell users to open tenant routes without a workspace", () => {
    expect(
      resolveNotificationLinkAccess("/sales/orders/123", {
        capabilities: platformShellContext.capabilities,
        ctx: platformShellContext,
      }),
    ).toMatchObject({
      canOpen: false,
      message: "This screen is not available in your current module.",
    });
  });
});
