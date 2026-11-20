import { describe, expect, it } from "vitest";
import { sidebarChildrenExpanded, toggleSidebarChildren } from "@/lib/sidebar-expansion";

describe("sidebar parent expansion", () => {
  it("expands parents by default", () => {
    expect(sidebarChildrenExpanded({ collapsedItems: new Set(), childrenKey: "driving:reports" })).toBe(true);
  });

  it("keeps a parent open regardless of which page is active", () => {
    expect(sidebarChildrenExpanded({ collapsedItems: new Set(), childrenKey: "driving:settings" })).toBe(true);
  });

  it("collapses only the parent the user closed", () => {
    const collapsed = toggleSidebarChildren(new Set(), "driving:reports");
    expect(sidebarChildrenExpanded({ collapsedItems: collapsed, childrenKey: "driving:reports" })).toBe(false);
    expect(sidebarChildrenExpanded({ collapsedItems: collapsed, childrenKey: "driving:settings" })).toBe(true);
  });

  it("reopens a collapsed parent when toggled again", () => {
    const collapsed = toggleSidebarChildren(new Set(), "driving:reports");
    const reopened = toggleSidebarChildren(collapsed, "driving:reports");
    expect(sidebarChildrenExpanded({ collapsedItems: reopened, childrenKey: "driving:reports" })).toBe(true);
  });

  it("does not mutate the previous collapsed set", () => {
    const original = new Set(["driving:reports"]);
    toggleSidebarChildren(original, "driving:settings");
    expect([...original]).toEqual(["driving:reports"]);
  });
});
