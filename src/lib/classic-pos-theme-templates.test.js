import { describe, expect, it } from "vitest";
import {
  classicPosThemeCssVars,
  normalizeClassicPosHexColor,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";

describe("classic POS theme color overrides", () => {
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
});
