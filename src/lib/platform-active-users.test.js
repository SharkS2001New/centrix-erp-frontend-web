import { describe, expect, it } from "vitest";
import { groupActiveSessionsByBranch } from "./platform-active-users";

describe("groupActiveSessionsByBranch", () => {
  it("groups sessions by branch when the organization has multiple branches", () => {
    const sessions = [
      { id: 1, branch_id: 10, branch_name: "East" },
      { id: 2, branch_id: 10, branch_name: "East" },
      { id: 3, branch_id: 20, branch_name: "West" },
    ];

    const result = groupActiveSessionsByBranch({ branch_count: 2 }, sessions);

    expect(result.hasMultipleBranches).toBe(true);
    expect(result.groups.map(({ name, sessions: rows }) => [name, rows.length])).toEqual([
      ["East", 2],
      ["West", 1],
    ]);
  });

  it("keeps single-branch organizations ungrouped", () => {
    const result = groupActiveSessionsByBranch(
      { branch_count: 1 },
      [{ id: 1, branch_id: 10, branch_name: "Main" }],
    );

    expect(result.hasMultipleBranches).toBe(false);
    expect(result.groups).toHaveLength(1);
  });
});
