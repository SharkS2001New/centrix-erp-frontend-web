import { describe, expect, it } from "vitest";
import {
  workspaceBuilderExamplePrompts,
  workspaceBuilderMentionTypes,
  workspaceBuilderPlaceholder,
  workspaceBuilderSourceHint,
} from "@/lib/workspace-reports";

describe("workspace report builder scoping", () => {
  it("keeps HR example prompts inside workforce/payroll language", () => {
    const prompts = workspaceBuilderExamplePrompts("hr");
    expect(prompts.length).toBeGreaterThan(0);
    const joined = prompts.join(" ").toLowerCase();
    expect(joined).toMatch(/payroll|attendance|headcount|department|workforce/);
    expect(joined).not.toMatch(/sales by product|purchases by supplier|debtors/);
  });

  it("limits HR @mentions to employee/branch/user", () => {
    expect(workspaceBuilderMentionTypes("hr")).toEqual(["employee", "branch", "user"]);
    expect(workspaceBuilderMentionTypes("backoffice")).toContain("product");
    expect(workspaceBuilderMentionTypes("backoffice")).not.toContain("employee");
  });

  it("uses module-specific placeholders and source hints", () => {
    expect(workspaceBuilderPlaceholder("hr").toLowerCase()).toMatch(/attendance|payroll/);
    expect(workspaceBuilderSourceHint("hr").toLowerCase()).toMatch(/workforce|payroll/);
    expect(workspaceBuilderSourceHint("hr").toLowerCase()).not.toMatch(/sales, inventory/);
    expect(workspaceBuilderSourceHint("backoffice").toLowerCase()).toMatch(/sales|inventory|purchasing/);
  });
});
