import { beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "@/lib/permission-codes";
import {
  BACKOFFICE_DEFAULT_LANDING_PATH,
  recallWorkspaceLandingPath,
  resolveAccessibleWorkspaces,
  workspaceLandingPath,
} from "@/lib/workspace-navigation";

vi.mock("@/lib/auth-storage", () => ({
  getStoredWorkspace: vi.fn(() => null),
}));

import { getStoredWorkspace } from "@/lib/auth-storage";

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

function ctx(permissions, caps = capabilities) {
  const granted = new Set(permissions);
  return {
    hasPermission: (code) => granted.has(code),
    isModuleEnabled: () => true,
    user: { is_admin: false },
    organization: {},
    capabilities: caps,
    isSuperAdmin: () => false,
  };
}

describe("workspace-navigation backoffice landing", () => {
  beforeEach(() => {
    getStoredWorkspace.mockReturnValue(null);
  });

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

  it("opens Business summary when switching from External POS (stored workspace still pos)", () => {
    getStoredWorkspace.mockReturnValue("pos");
    const access = ctx([
      P.dashboard.overview.view,
      P.pos.checkout.create,
      P.sales.orders.create,
    ]);

    expect(
      recallWorkspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe(BACKOFFICE_DEFAULT_LANDING_PATH);
    expect(
      workspaceLandingPath(1, 1, "backoffice", capabilities, access),
    ).toBe(BACKOFFICE_DEFAULT_LANDING_PATH);
  });
});

describe("resolveAccessibleWorkspaces terminal shells", () => {
  beforeEach(() => {
    getStoredWorkspace.mockReturnValue(null);
  });

  const withPosAndBackoffice = {
    ...capabilities,
    workspaces: [
      ...capabilities.workspaces,
      { id: "pos", label: "External POS", home_path: "/pos" },
    ],
    modules: {
      ...capabilities.modules,
      "sales.pos": true,
      "sales.backend": true,
    },
  };

  /** External POS terminal only — no Backoffice Sales & Orders, no Till ops screens. */
  const terminalOnlyPermissions = [
    P.pos.terminal.view,
    P.pos.checkout.create,
    P.pos.till_management.create,
    P.catalogue.products.view,
  ];

  /** Backoffice Till operations sidebar (view + EOD) — unlocks Backoffice workspace. */
  const tillOpsPermissions = [
    P.pos.till_management.view,
    P.pos.end_of_day.view,
  ];

  it("keeps External POS for a cashier with only terminal permissions", () => {
    const access = ctx(terminalOnlyPermissions, withPosAndBackoffice);
    const ids = resolveAccessibleWorkspaces(access, withPosAndBackoffice).map((w) => w.id);
    expect(ids).toContain("pos");
  });

  it("does not unlock Backoffice for terminal-only cashiers (no Sales & Orders, no Till ops)", () => {
    const access = ctx(terminalOnlyPermissions, withPosAndBackoffice);
    const ids = resolveAccessibleWorkspaces(access, withPosAndBackoffice).map((w) => w.id);
    expect(ids).not.toContain("backoffice");
  });

  it("unlocks Backoffice when Till management / End of day permissions are granted", () => {
    const access = ctx([...terminalOnlyPermissions, ...tillOpsPermissions], withPosAndBackoffice);
    const ids = resolveAccessibleWorkspaces(access, withPosAndBackoffice).map((w) => w.id);
    expect(ids).toContain("pos");
    expect(ids).toContain("backoffice");
  });

  it("drops External POS when terminal view permission is missing", () => {
    const access = ctx([P.pos.checkout.create, P.dashboard.overview.view], withPosAndBackoffice);
    const ids = resolveAccessibleWorkspaces(access, withPosAndBackoffice).map((w) => w.id);
    expect(ids).not.toContain("pos");
  });

  it("keeps Backoffice when the user has Sales & Orders create", () => {
    const access = ctx(
      [P.sales.orders.create, P.dashboard.overview.view, P.pos.terminal.view],
      withPosAndBackoffice,
    );
    const ids = resolveAccessibleWorkspaces(access, withPosAndBackoffice).map((w) => w.id);
    expect(ids).toContain("backoffice");
    expect(ids).toContain("pos");
  });
});
