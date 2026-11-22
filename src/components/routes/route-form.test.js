import { describe, expect, it } from "vitest";
import { shouldShowRouteBranchSelect } from "@/components/routes/route-form";

describe("shouldShowRouteBranchSelect", () => {
  it("only shows the picker to org-wide users when multiple branches exist", () => {
    const branches = [{ id: 1 }, { id: 2 }];

    expect(shouldShowRouteBranchSelect(branches, false)).toBe(false);
    expect(shouldShowRouteBranchSelect(branches, true)).toBe(true);
    expect(shouldShowRouteBranchSelect([{ id: 1 }], true)).toBe(false);
  });
});
