import { describe, expect, it } from "vitest";
import {
  isClassicExternalPosLayout,
  normalizeExternalPosLayout,
  resolveExternalPosLayout,
} from "@/lib/external-pos-layout";

describe("external-pos-layout", () => {
  it("defaults to modern", () => {
    expect(normalizeExternalPosLayout(null)).toBe("modern");
    expect(resolveExternalPosLayout(null)).toBe("modern");
    expect(isClassicExternalPosLayout(null)).toBe(false);
  });

  it("reads classic from module settings / capabilities", () => {
    expect(
      resolveExternalPosLayout({
        module_settings: { sales: { external_pos_layout: "classic" } },
      }),
    ).toBe("classic");
    expect(
      isClassicExternalPosLayout({
        sales: { external_pos_layout: "classic" },
      }),
    ).toBe(true);
  });
});
