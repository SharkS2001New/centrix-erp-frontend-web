import { describe, expect, it } from "vitest";
import { BRAND_COLORS, DEFAULT_PWA_THEME_COLOR, DARK_PWA_THEME_COLOR } from "@/lib/branding";
import {
  classicPosThemeBridgeVars,
  classicPosThemeCssVars,
  normalizeClassicPosHexColor,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
  orgErpSidebarThemeVars,
  resolvePwaThemeColor,
} from "@/lib/classic-pos-theme-templates";

describe("classic POS theme color overrides", () => {
  it("defaults unknown templates to centrix", () => {
    expect(normalizeClassicPosThemeTemplate(null)).toBe("centrix");
    expect(normalizeClassicPosThemeTemplate("default")).toBe("centrix");
    expect(normalizeClassicPosThemeTemplate("nope")).toBe("centrix");
    expect(normalizeClassicPosThemeTemplate("legacy")).toBe("legacy");
  });

  it("normalizes hex colors", () => {
    expect(normalizeClassicPosHexColor("#BE185D")).toBe("#be185d");
    expect(normalizeClassicPosHexColor("CDB48B")).toBe("#cdb48b");
    expect(normalizeClassicPosHexColor("#123")).toBe("#112233");
    expect(normalizeClassicPosHexColor("nope")).toBeNull();
  });

  it("keeps only known override keys", () => {
    expect(
      normalizeClassicPosThemeColors({
        workspace: "#CDB48B",
        header: "not-a-color",
        footer: "",
        button: "#abcdef",
        extra: "#111111",
      }),
    ).toEqual({
      workspace: "#cdb48b",
      button: "#abcdef",
    });
  });

  it("applies overrides on top of a template", () => {
    const base = classicPosThemeCssVars("legacy");
    const custom = classicPosThemeCssVars("legacy", {
      workspace: "#112233",
      header: "#445566",
      button: "#778899",
    });
    expect(custom["--classic-bg"]).toBe("#112233");
    expect(custom["--classic-header"]).toBe("#445566");
    expect(custom["--classic-button"]).toBe("#778899");
    expect(custom["--classic-footer"]).toBe(base["--classic-footer"]);
  });

  it("defaults button to header when button override is empty", () => {
    const custom = classicPosThemeCssVars("rose", { header: "#112233" });
    expect(custom["--classic-header"]).toBe("#112233");
    expect(custom["--classic-button"]).toBe("#112233");
  });

  it("applies select override for list highlights", () => {
    const custom = classicPosThemeCssVars("legacy", { select: "#7a2031" });
    expect(custom["--classic-select"]).toBe("#7a2031");
    expect(custom["--classic-row-selected"]).toBe("#7a2031");
    expect(custom["--classic-select-fg"]).toBe("#f8fafc");
  });

  it("org sidebar theme exposes sidebar + primary button CSS vars only", () => {
    const sidebar = orgErpSidebarThemeVars("rose");
    const classic = classicPosThemeCssVars("rose");
    expect(sidebar["--erp-sidebar-bg"]).toBe(classic["--classic-header"]);
    expect(sidebar["--theme-primary"]).toBe(classic["--classic-button"] || classic["--classic-header"]);
    expect(sidebar["--theme-primary-hover"]).toBeTruthy();
    expect(sidebar["--theme-primary-fg"]).toBeTruthy();
    expect(sidebar["--theme-primary-subtle"]).toBeTruthy();
    expect(sidebar["--theme-primary-muted"]).toBeTruthy();
    expect(sidebar["--theme-page-bg"]).toBeUndefined();
    expect(sidebar["--theme-surface"]).toBeUndefined();
    expect(sidebar["--classic-footer"]).toBeUndefined();
  });

  it("org sidebar dark mode keeps surfaces dark while preserving brand primary", () => {
    const light = orgErpSidebarThemeVars("ocean");
    const dark = orgErpSidebarThemeVars("ocean", null, "dark");
    const classic = classicPosThemeCssVars("ocean");
    expect(light["--erp-sidebar-bg"]).toBe(classic["--classic-header"]);
    expect(dark["--erp-sidebar-bg"]).not.toBe(light["--erp-sidebar-bg"]);
    expect(dark["--theme-primary-muted"]).toBe("#252a35");
    expect(dark["--theme-page-bg"]).toBeUndefined();
    expect(dark["--theme-surface"]).toBeUndefined();
    expect(dark["--theme-primary"]).toBeTruthy();
  });

  it("classic POS bridge includes full theme tokens", () => {
    const bridge = classicPosThemeBridgeVars("rose");
    expect(bridge["--theme-primary"]).toBeTruthy();
    expect(bridge["--classic-footer"]).toBeTruthy();
    expect(bridge["--classic-bg"]).toBeTruthy();
  });

  it("resolves PWA theme color from sidebar/header vars", () => {
    expect(DEFAULT_PWA_THEME_COLOR).toBe(BRAND_COLORS.blue);
    expect(resolvePwaThemeColor({})).toBe(DEFAULT_PWA_THEME_COLOR);
    expect(resolvePwaThemeColor({}, "dark")).toBe(DARK_PWA_THEME_COLOR);
    expect(resolvePwaThemeColor({ "--erp-sidebar-bg": "#0d9488" })).toBe("#0d9488");
    expect(resolvePwaThemeColor(orgErpSidebarThemeVars("ocean"))).toBe(
      orgErpSidebarThemeVars("ocean")["--erp-sidebar-bg"],
    );
  });
});
