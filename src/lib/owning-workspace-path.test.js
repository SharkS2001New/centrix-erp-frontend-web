import { describe, expect, it } from "vitest";
import { owningWorkspaceIdForPath, pathBelongsToWorkspace } from "@/lib/workspaces";

const workspaces = [
  { id: "backoffice" },
  { id: "accounting" },
  { id: "hr" },
  { id: "distribution" },
  { id: "admin" },
];

describe("owningWorkspaceIdForPath", () => {
  it("keeps the current workspace when it already owns the path", () => {
    expect(owningWorkspaceIdForPath("/dashboard", workspaces, "backoffice")).toBe("backoffice");
    expect(owningWorkspaceIdForPath("/expenses", workspaces, "backoffice")).toBe("backoffice");
  });

  it("switches to HR for HR routes while in Backoffice", () => {
    expect(owningWorkspaceIdForPath("/hr/employees", workspaces, "backoffice")).toBe("hr");
    expect(owningWorkspaceIdForPath("/employees", workspaces, "backoffice")).toBe("hr");
  });

  it("prefers accounting over backoffice for expenses when not already in backoffice", () => {
    expect(owningWorkspaceIdForPath("/expenses", workspaces, "hr")).toBe("accounting");
  });

  it("returns null when no accessible workspace owns the path", () => {
    expect(owningWorkspaceIdForPath("/hr/payroll", [{ id: "backoffice" }], "backoffice")).toBe(
      null,
    );
  });

  it("stays on current workspace for shared profile routes", () => {
    expect(owningWorkspaceIdForPath("/profile", workspaces, "backoffice")).toBe("backoffice");
  });

  it("keeps embedded SPA administration and payroll routes in the SPA workspace", () => {
    expect(pathBelongsToWorkspace("/spa/admin/branches", "spa")).toBe(true);
    expect(pathBelongsToWorkspace("/spa/staff/payroll", "spa")).toBe(true);
    expect(pathBelongsToWorkspace("/spa/staff/payroll/runs/42", "spa")).toBe(true);
  });

  it("keeps payroll run reports in the SPA workspace", () => {
    for (const report of [
      "statutory-deductions",
      "bank-transfer",
      "nssf-remittance",
      "other-deductions",
    ]) {
      expect(pathBelongsToWorkspace(`/reports/${report}?payroll_run_id=42`, "spa")).toBe(true);
    }
  });
});
