import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/lib/route-access";

const baseCtx = {
  hasPermission: () => true,
  isModuleEnabled: () => true,
  user: { is_admin: false },
  organization: {},
  capabilities: { modules: { sales: true, hr: true, inventory: true } },
  isSuperAdmin: () => false,
};

describe("route-access", () => {
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
});
