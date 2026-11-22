import { describe, expect, it } from "vitest";
import { defaultReportBranchId } from "./report-filters";

describe("default report branch", () => {
  it("uses the global branch instead of an org-wide user's home branch", () => {
    expect(defaultReportBranchId({ branch_id: 3 }, () => true, "8")).toBe("8");
  });

  it("keeps all branches selected for org-wide users when the global branch is clear", () => {
    expect(defaultReportBranchId({ branch_id: 3 }, () => true, "")).toBe("");
  });

  it("keeps branch-scoped users on their assigned branch", () => {
    expect(defaultReportBranchId({ branch_id: 3 }, () => false, "")).toBe("3");
  });
});
