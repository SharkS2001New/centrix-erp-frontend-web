import { describe, expect, it } from "vitest";
import { pathBelongsToWorkspace } from "@/lib/workspaces";

describe("pathBelongsToWorkspace query strip", () => {
  it("recognizes HR payroll reports even with payroll_run_id query", () => {
    expect(pathBelongsToWorkspace("/reports/statutory-deductions?payroll_run_id=12", "hr")).toBe(true);
    expect(pathBelongsToWorkspace("/reports/nssf-remittance?payroll_run_id=12", "hr")).toBe(true);
    expect(pathBelongsToWorkspace("/reports/other-deductions?payroll_run_id=12", "hr")).toBe(true);
    expect(pathBelongsToWorkspace("/reports/bank-transfer?payroll_run_id=12", "hr")).toBe(true);
  });
});
