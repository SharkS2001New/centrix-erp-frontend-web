import { describe, expect, it } from "vitest";
import { P } from "@/lib/permission-codes";
import {
  BACKOFFICE_DEFAULT_LANDING_PATH,
  recallWorkspaceLandingPath,
  workspaceLandingPath,
} from "@/lib/workspace-navigation";

const capabilities = {
  platform_tab_workspace_enabled: true,
  workspaces: [
    {
      id: "backoffice",
      label: "Backoffice",
      home_path: "/inventory/stock",
    },
  ],
  modules: {
    sales: true,
    inventory: true,
    "inventory.dashboard": true,
    "sales.dashboard": true,
  },
};

function ctx(permissions) {
  const granted = new Set(permissions);
  return {
    hasPermission: (code) => granted.has(code),
    isModuleEnabled: () => true,
    user: { is_admin: false },
    organization: {},
    capabilities,
    isSuperAdmin: () => false,
  };
}

describe("workspace-navigation backoffice landing", () => {
  it("opens Business summary when overview permission is granted", () => {
    const access = ctx([P.dashboard.overview.view]);

    expect(
      workspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe(BACKOFFICE_DEFAULT_LANDING_PATH);
    expect(
      recallWorkspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe(BACKOFFICE_DEFAULT_LANDING_PATH);
  });

  it("falls back to the first accessible nav item without overview permission", () => {
    const access = ctx([P.dashboard.inventory.view, P.inventory.stock.view]);

    expect(
      workspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe("/inventory");
    expect(
      recallWorkspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe("/inventory");
  });

  it("prefers Business summary over API home_path and remembered routes", () => {
    const access = ctx([P.dashboard.overview.view, P.inventory.stock.view]);

    expect(
      recallWorkspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe(BACKOFFICE_DEFAULT_LANDING_PATH);
  });
});
