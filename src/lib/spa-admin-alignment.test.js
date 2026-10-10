import { describe, expect, it } from "vitest";
import { isNavItemVisible, isNavSectionVisible, navSections } from "@/lib/nav-config";
import { isOrgSettingsTabVisible } from "@/lib/org-settings-tabs";
import { buildWorkspaceNavSections } from "@/lib/workspace-nav";

const spaCaps = {
  industry: "spa",
  deployment_profile: "spa_kinyozi",
  modules: { spa: true, admin: true, sales: true, inventory: true, "hospitality.backend": true },
};

function navContext(capabilities = spaCaps) {
  return {
    capabilities,
    hasPermission: () => true,
    hasNavPermission: () => true,
    isModuleEnabled: (key) => Boolean(capabilities.modules?.[key]),
    isSuperAdmin: () => false,
    requireTillFloat: false,
    user: { is_admin: true },
    organization: { company_code: "SPA" },
  };
}

describe("SPA & Kinyozi administration", () => {
  it("hides shop and hotel settings that do not belong on a salon", () => {
    for (const tabId of ["sales", "external-pos", "mobile", "distribution", "whatsapp", "inventory", "procurement", "manager-approvals"]) {
      expect(isOrgSettingsTabVisible(tabId, spaCaps, { tenantSelfService: true })).toBe(false);
    }
    expect(isOrgSettingsTabVisible("general", spaCaps, { tenantSelfService: true })).toBe(true);
    expect(isOrgSettingsTabVisible("security", spaCaps, { tenantSelfService: true })).toBe(true);
    expect(isOrgSettingsTabVisible("hr", spaCaps, { tenantSelfService: true })).toBe(false);
    expect(
      isOrgSettingsTabVisible("hr", { ...spaCaps, modules: { ...spaCaps.modules, hr_payroll: true } }, { tenantSelfService: true }),
    ).toBe(true);
    expect(
      isOrgSettingsTabVisible(
        "manager-approvals",
        { ...spaCaps, modules: { ...spaCaps.modules, accounting: true } },
        { tenantSelfService: true },
      ),
    ).toBe(true);
  });

  it("hides till printing and hotel food settings in the admin menu", () => {
    const ctx = navContext();
    const org = navSections.find((section) => section.id === "admin_organization");
    const till = org.items.find((item) => item.href === "/admin/till-printing");
    const hotel = org.items.find((item) => item.href === "/admin/hotel-settings");
    expect(isNavItemVisible(till, ctx)).toBe(false);
    expect(isNavItemVisible(hotel, ctx)).toBe(false);
    expect(isNavItemVisible(org.items.find((item) => item.href === "/admin/company"), ctx)).toBe(true);
  });

  it("does not put hotel operations in a salon admin menu", () => {
    const ctx = navContext();
    const ops = navSections.find((section) => section.id === "hospitality_ops");
    expect(isNavSectionVisible(ops, ctx)).toBe(false);
    const adminNav = buildWorkspaceNavSections({
      capabilities: ctx.capabilities,
      navContext: ctx,
      workspaceId: "admin",
      isSuperAdmin: () => false,
    });
    expect(adminNav.some((section) => section.id === "hospitality_ops")).toBe(false);
    expect(adminNav.some((section) => section.items?.some((item) => item.href === "/admin/till-printing"))).toBe(
      false,
    );
  });
});
