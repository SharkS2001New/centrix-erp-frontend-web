import { describe, expect, it } from "vitest";
import {
  ADMIN_SETTINGS_CATALOG,
  adminSettingsToNavEntries,
  searchAdminSettings,
} from "@/lib/admin-settings-catalog";

describe("admin-settings-catalog", () => {
  it("indexes core admin destinations", () => {
    expect(ADMIN_SETTINGS_CATALOG.length).toBeGreaterThan(20);
    expect(ADMIN_SETTINGS_CATALOG.some((e) => e.href === "/admin/kra-settings")).toBe(true);
    expect(
      ADMIN_SETTINGS_CATALOG.some((e) => e.href === "/admin/settings?tab=sales&section=pos"),
    ).toBe(true);
  });

  it("finds KRA by synonym and directs to KRA settings", () => {
    const hits = searchAdminSettings("etims", { limit: 5 });
    expect(hits[0]?.href).toBe("/admin/kra-settings");
  });

  it("finds credit sales under Sales → Tills", () => {
    const hits = searchAdminSettings("credit sales", { limit: 5 });
    expect(hits.some((h) => h.href.includes("tab=sales") && h.href.includes("section=pos"))).toBe(
      true,
    );
  });

  it("finds SMS messaging setup", () => {
    const hits = searchAdminSettings("sms", { limit: 5 });
    expect(hits.some((h) => h.href.includes("section=sms"))).toBe(true);
  });

  it("maps hits for global module search", () => {
    const hits = searchAdminSettings("till float", { limit: 3 });
    const nav = adminSettingsToNavEntries(hits);
    expect(nav[0]?.href).toContain("/admin/settings");
    expect(nav[0]?.group).toContain("Organization settings");
  });

  it("returns empty for blank query", () => {
    expect(searchAdminSettings("")).toEqual([]);
  });
});
