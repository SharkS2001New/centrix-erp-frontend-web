import { describe, expect, it } from "vitest";
import { isNavItemVisible } from "@/lib/nav-config";
import { hasPlatformAreaPermission, platformNavItems } from "@/lib/platform-nav";

const platformOrg = { company_code: "PLATFORM", module_settings: { platform: true } };

function platformNavContext(capabilities = {}) {
  return {
    organization: platformOrg,
    capabilities: {
      is_super_admin: true,
      platform_full_access: true,
      platform_admin: {
        full_access: true,
        areas: ["tenants", "integrations", "operations", "billing", "settings", "admins"],
      },
      platform_permissions: ["tenants", "integrations", "operations", "billing", "settings", "admins"],
      ...capabilities,
    },
    isSuperAdmin: () => true,
    // Mirrors resolveHasNavPermission for platform-shell users.
    hasNavPermission: () => false,
    hasPermission: () => false,
    isModuleEnabled: () => false,
  };
}

describe("platform sidebar visibility", () => {
  it("does not put ERP permission codes on platform nav items", () => {
    for (const item of platformNavItems()) {
      expect(item.permission).toBeUndefined();
      expect(item.platformPermission).toBeTruthy();
      expect(item.superAdminOnly).toBe(true);
    }
  });

  it("shows platform links for a full-access platform admin", () => {
    const ctx = platformNavContext();
    const visible = platformNavItems().filter((item) => isNavItemVisible(item, ctx));
    expect(visible.length).toBe(platformNavItems().length);
    expect(visible.some((item) => item.href === "/platform/organizations")).toBe(true);
  });

  it("hides areas the limited platform admin does not have", () => {
    const ctx = platformNavContext({
      platform_full_access: false,
      platform_admin: {
        full_access: false,
        areas: ["tenants"],
      },
      platform_permissions: ["tenants"],
    });

    expect(hasPlatformAreaPermission(ctx.capabilities, "tenants")).toBe(true);
    expect(hasPlatformAreaPermission(ctx.capabilities, "billing")).toBe(false);

    const visible = platformNavItems().filter((item) => isNavItemVisible(item, ctx));
    expect(visible.every((item) => item.platformPermission === "tenants")).toBe(true);
    expect(visible.some((item) => item.platformPermission === "billing")).toBe(false);
  });
});
