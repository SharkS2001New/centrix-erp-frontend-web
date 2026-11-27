import { describe, expect, it } from "vitest";
import { defaultReportBranchId } from "./report-filters";
import { buildReportQueryParams } from "./report-filter-config";

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

describe("hospitality sales report user filters", () => {
  it("passes the selected user to each food and drink sales report", () => {
    const reportKeys = [
      "hospitality-fnb-checks",
      "hospitality-fnb-by-outlet",
      "hospitality-fnb-by-hour",
      "hospitality-fnb-by-category",
      "hospitality-open-checks",
      "hospitality-voids",
    ];

    for (const reportKey of reportKeys) {
      expect(
        buildReportQueryParams(reportKey, { extraValues: { cashier_id: "17" } }),
      ).toHaveProperty("cashier_id", "17");
    }
  });
});

describe("sales rep stock movement report filters", () => {
  it("uses the report date range, branch, and search filters", () => {
    expect(
      buildReportQueryParams("sales-rep-stock-movements", {
        fromDate: "2026-11-01",
        toDate: "2026-11-27",
        branchId: "4",
        extraValues: { q: "Flour" },
      }),
    ).toMatchObject({
      date_column: "created_at",
      from_date: "2026-11-01",
      to_date: "2026-11-27",
      branch_id: "4",
      q: "Flour",
    });
  });
});
