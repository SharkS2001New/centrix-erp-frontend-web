import { beforeEach, describe, expect, it, vi } from "vitest";
import { canAccessRoute } from "@/lib/route-access";

vi.mock("@/lib/auth-storage", () => ({
  getStoredWorkspace: vi.fn(() => null),
  getStoredToken: vi.fn(() => null),
}));

import { getStoredWorkspace } from "@/lib/auth-storage";

const baseCtx = {
  hasPermission: () => true,
  isModuleEnabled: () => true,
  user: { is_admin: false },
  organization: {},
  capabilities: { modules: { sales: true, hr: true, inventory: true } },
  isSuperAdmin: () => false,
};

describe("route-access", () => {
  beforeEach(() => {
    getStoredWorkspace.mockReturnValue(null);
  });

  it("allows notifications for any authenticated user", () => {
    expect(canAccessRoute("/notifications", baseCtx)).toBe(true);
  });

  it("denies unknown sales routes without matching permission rules", () => {
    expect(
      canAccessRoute("/sales/unknown-module", {
        ...baseCtx,
        hasPermission: () => false,
      }),
    ).toBe(false);
  });

  it("allows profile", () => {
    expect(canAccessRoute("/profile", baseCtx)).toBe(true);
  });

  it("allows admin settings for org administrator", () => {
    expect(
      canAccessRoute("/admin/settings", {
        ...baseCtx,
        user: { is_admin: true },
        capabilities: { ...baseCtx.capabilities, is_admin: true, modules: { admin: true, sales: true } },
        hasPermission: () => false,
      }),
    ).toBe(true);
  });

  it("denies admin settings without permission", () => {
    expect(
      canAccessRoute("/admin/settings", {
        ...baseCtx,
        hasPermission: () => false,
      }),
    ).toBe(false);
  });

  it("allows HR payroll when module and permission match", () => {
    expect(
      canAccessRoute("/hr/payroll", {
        ...baseCtx,
        hasPermission: (code) => code === "hr.payroll.view",
      }),
    ).toBe(true);
  });

  it("allows new supplier when create permission is granted", () => {
    expect(
      canAccessRoute("/suppliers/new", {
        ...baseCtx,
        isModuleEnabled: (key) => key === "customers_suppliers",
        hasPermission: (code) => code === "purchasing.suppliers.create",
      }),
    ).toBe(true);
  });

  it("denies new supplier without create permission", () => {
    expect(
      canAccessRoute("/suppliers/new", {
        ...baseCtx,
        isModuleEnabled: (key) => key === "customers_suppliers",
        hasPermission: (code) => code === "purchasing.suppliers.view",
      }),
    ).toBe(false);
  });

  it("allows missed punches with its own permission", () => {
    expect(
      canAccessRoute("/hr/missed-punches", {
        ...baseCtx,
        hasPermission: (code) => code === "hr.missed_punches.view",
      }),
    ).toBe(true);
  });

  it("denies missed punches when only today's attendance is granted", () => {
    expect(
      canAccessRoute("/hr/missed-punches", {
        ...baseCtx,
        hasPermission: (code) => code === "hr.attendance.view",
      }),
    ).toBe(false);
  });

  it("allows Distribution drivers/vehicles when Field-sales fleet nav is hidden", () => {
    getStoredWorkspace.mockReturnValue("distribution");
    const ctx = {
      ...baseCtx,
      isModuleEnabled: (key) => key === "distribution",
      hasPermission: (code) =>
        code === "fulfillment.drivers.view" || code === "fulfillment.vehicles.view",
      capabilities: {
        modules: { distribution: true },
        distribution_ops_enabled: true,
        module_settings: {},
      },
    };

    expect(canAccessRoute("/fulfillment/drivers", ctx)).toBe(true);
    expect(canAccessRoute("/fulfillment/vehicles", ctx)).toBe(true);
  });
});
