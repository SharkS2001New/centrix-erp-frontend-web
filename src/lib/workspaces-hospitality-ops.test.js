import { describe, expect, it } from "vitest";
import { isNavItemVisible, isNavSectionVisible, navSections } from "@/lib/nav-config";
import {
  ADMIN_HOSPITALITY_OPS_PATH_PREFIXES,
  filterNavSectionsForWorkspace,
  navItemBelongsToWorkspace,
  pathBelongsToWorkspace,
} from "@/lib/workspaces";
import { P } from "@/lib/permission-codes";

const hospitalityOpsSection = navSections.find((s) => s.id === "hospitality_ops");

function makeNavContext(overrides = {}) {
  const capabilities = {
    industry: "hospitality",
    modules: { "hospitality.backend": true },
    module_settings: { hospitality_services: { housekeeping: true, night_audit: true } },
    ...overrides.capabilities,
  };
  return {
    capabilities,
    hasPermission: () => true,
    hasNavPermission: () => true,
    isModuleEnabled: (key) => Boolean(capabilities.modules?.[key]),
    isSuperAdmin: () => false,
    requireTillFloat: false,
    user: { is_admin: true },
    organization: { company_code: "HOTEL" },
    ...overrides,
  };
}

describe("hospitality Operations under Admin", () => {
  it("defines housekeeping, outlets, and night audit links", () => {
    expect(hospitalityOpsSection?.label).toBe("Operations");
    expect(hospitalityOpsSection?.requireHospitalityIndustry).toBe(true);
    expect(hospitalityOpsSection?.items.map((i) => i.href)).toEqual([
      "/hospitality/housekeeping",
      "/hospitality/outlets",
      "/hospitality/night-audit",
    ]);
  });

  it("hides Operations section for retail industry", () => {
    const ctx = makeNavContext({ capabilities: { industry: "commerce", modules: {} } });
    expect(isNavSectionVisible(hospitalityOpsSection, ctx)).toBe(false);
  });

  it("shows Operations section for hotel industry", () => {
    expect(isNavSectionVisible(hospitalityOpsSection, makeNavContext())).toBe(true);
  });

  it("includes Operations in Admin workspace, not hospitality backoffice", () => {
    const ctx = makeNavContext();
    const adminNav = filterNavSectionsForWorkspace(navSections, "admin", ctx, isNavItemVisible);
    const hotelNav = filterNavSectionsForWorkspace(
      navSections,
      "hospitality_backoffice",
      ctx,
      isNavItemVisible,
    );
    expect(adminNav.some((s) => s.id === "hospitality_ops")).toBe(true);
    expect(hotelNav.some((s) => s.id === "hospitality_ops")).toBe(false);
  });

  it("routes hospitality ops pages under the Admin workspace", () => {
    for (const prefix of ADMIN_HOSPITALITY_OPS_PATH_PREFIXES) {
      expect(navItemBelongsToWorkspace({ href: prefix }, "admin")).toBe(true);
      expect(pathBelongsToWorkspace(prefix, "admin")).toBe(true);
    }
    expect(navItemBelongsToWorkspace({ href: "/hospitality/outlets" }, "hospitality_backoffice")).toBe(
      true,
    );
  });

  it("respects housekeeping permission on outlets item", () => {
    const outlets = hospitalityOpsSection.items.find((i) => i.href === "/hospitality/outlets");
    expect(outlets.permission).toBe(P.hospitality.outlets.view);
  });
});
