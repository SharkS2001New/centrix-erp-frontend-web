import { describe, expect, it } from "vitest";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { P } from "@/lib/permission-codes";

function findAttendanceClockItem() {
  const orgSection = navSections.find((s) => s.id === "admin_organization");
  return orgSection?.items?.find((item) => item.href === "/admin/attendance-clock");
}

describe("admin attendance clock nav", () => {
  const item = findAttendanceClockItem();

  it("is configured to require HR payroll", () => {
    expect(item?.requireHrPayroll).toBe(true);
  });

  it("hides when HR payroll module is off", () => {
    const ctx = {
      isModuleEnabled: (key) => key === "admin",
      hasPermission: (code) => code === P.admin.attendance_clock.view,
      capabilities: { modules: { admin: true, hr_payroll: false }, is_admin: true },
      user: { is_admin: true },
      isSuperAdmin: () => false,
      organization: { company_code: "DEMO" },
    };
    expect(isNavItemVisible(item, ctx)).toBe(false);
  });

  it("shows when admin and HR payroll are enabled", () => {
    const ctx = {
      isModuleEnabled: (key) => key === "admin" || key === "hr_payroll",
      hasPermission: (code) => code === P.admin.attendance_clock.view,
      capabilities: { modules: { admin: true, hr_payroll: true }, is_admin: true },
      user: { is_admin: true },
      isSuperAdmin: () => false,
      organization: { company_code: "DEMO" },
    };
    expect(isNavItemVisible(item, ctx)).toBe(true);
  });
});
