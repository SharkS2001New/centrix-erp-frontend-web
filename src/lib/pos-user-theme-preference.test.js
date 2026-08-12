import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readPosUserThemePreference,
  resolveEffectivePosThemeTemplate,
  writePosUserThemePreference,
} from "@/lib/pos-user-theme-preference";

describe("pos user theme preference", () => {
  beforeEach(() => {
    const store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => {
        store[key] = value;
      },
      removeItem: (key) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    });
  });

  it("stores a personal template per user and organization", () => {
    writePosUserThemePreference(12, 99, { template: "ocean" });
    expect(readPosUserThemePreference(12, 99)).toEqual({
      template: "ocean",
      useOrgDefault: false,
    });
  });

  it("clears override when organization default is chosen", () => {
    writePosUserThemePreference(5, 1, { template: "midnight" });
    writePosUserThemePreference(5, 1, { useOrgDefault: true });
    expect(readPosUserThemePreference(5, 1)).toBeNull();
  });

  it("user override wins over org template", () => {
    expect(resolveEffectivePosThemeTemplate("centrix", { template: "rose", useOrgDefault: false })).toBe(
      "rose",
    );
    expect(resolveEffectivePosThemeTemplate("centrix", null)).toBe("centrix");
    expect(resolveEffectivePosThemeTemplate("centrix", { useOrgDefault: true, template: null })).toBe(
      "centrix",
    );
  });
});
