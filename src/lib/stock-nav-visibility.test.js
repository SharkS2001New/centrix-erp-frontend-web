import { describe, expect, it } from "vitest";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { filterNavSectionsForWorkspace } from "@/lib/workspaces";
import { isModuleEnabledForNav } from "@/lib/module-registry";
import { canViewReport, P } from "@/lib/permission-codes";
import { defaultWorkspaceId } from "@/lib/workspace-navigation";

const stockPerms = new Set([
  P.inventory.stock.view,
  P.inventory.movements.view,
  P.inventory.receipts.view,
  P.inventory.transfers.view,
  P.inventory.adjustments.view,
  P.inventory.damages.view,
  P.inventory.stock_take.view,
  P.dashboard.inventory.view,
  P.dashboard.overview.view,
]);

function makeCtx(overrides = {}) {
  const capabilities = {
    modules: {
      inventory: true,
      "inventory.dashboard": true,
      "inventory.reports": true,
    },
    module_settings: {},
    industry: "commerce",
    workspaces: [{ id: "backoffice", home_path: "/dashboard", label: "Backoffice" }],
    permissions: Object.fromEntries([...stockPerms].map((c) => [c, true])),
    assigned_permissions: Object.fromEntries([...stockPerms].map((c) => [c, true])),
  };
  return {
    isModuleEnabled: (key) => Boolean(capabilities.modules?.[key]),
    hasPermission: (code) => stockPerms.has(code),
    hasNavPermission: (code) => stockPerms.has(code),
    isSuperAdmin: () => false,
    requireTillFloat: false,
    user: { login_channels: ["backoffice"], is_admin: false },
    organization: { company_code: "DEMO" },
    capabilities,
    ...overrides,
  };
}

describe("stock-only nav visibility", () => {
  it("filters backoffice nav without throwing", () => {
    const ctx = makeCtx();
    expect(() =>
      filterNavSectionsForWorkspace(navSections, "backoffice", ctx, isNavItemVisible),
    ).not.toThrow();
  });

  it("does not throw when isModuleEnabled is missing", () => {
    const item = navSections.find((s) => s.id === "inventory")?.items?.[0];
    expect(item).toBeTruthy();
    expect(
      isNavItemVisible(item, {
        hasPermission: () => true,
        hasNavPermission: () => true,
        isSuperAdmin: () => false,
        capabilities: makeCtx().capabilities,
      }),
    ).toBe(false);
  });

  it("isModuleEnabledForNav tolerates a missing callback", () => {
    expect(isModuleEnabledForNav("inventory", undefined)).toBe(false);
  });

  it("defaultWorkspaceId tolerates a partial access context (AI panel bug)", () => {
    const caps = makeCtx().capabilities;
    expect(() =>
      defaultWorkspaceId(caps, {
        user: { is_admin: false },
        organization: {},
        isSuperAdmin: () => false,
      }),
    ).not.toThrow();
  });

  it("evaluates inventory report keys with stock view permission", () => {
    expect(canViewReport("items-currently-in-stock", (c) => stockPerms.has(c))).toBe(true);
    expect(canViewReport("low-stock", (c) => stockPerms.has(c))).toBe(false);
    expect(canViewReport("items-currently-in-stock", undefined)).toBe(false);
  });
});
