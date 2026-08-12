import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPosUserThemePreferenceSnapshot,
  readPosUserThemePreference,
  resolveEffectivePosThemeColors,
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
      colors: {},
      useOrgDefault: false,
    });
  });

  it("stores personal color overrides on top of a template", () => {
    writePosUserThemePreference(12, 99, {
      template: "ocean",
      colors: { header: "#112233", workspace: "not-a-color", button: "#aabbcc" },
    });
    expect(readPosUserThemePreference(12, 99)).toEqual({
      template: "ocean",
      colors: { header: "#112233", button: "#aabbcc" },
      useOrgDefault: false,
    });
  });

  it("clears override when organization default is chosen", () => {
    writePosUserThemePreference(5, 1, { template: "midnight", colors: { header: "#ffffff" } });
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

  it("personal colors win over org colors when set", () => {
    expect(
      resolveEffectivePosThemeColors({ header: "#000000" }, {
        template: "ocean",
        colors: { header: "#ff0000" },
        useOrgDefault: false,
      }),
    ).toEqual({ header: "#ff0000" });
    expect(
      resolveEffectivePosThemeColors({ header: "#000000" }, {
        template: "ocean",
        colors: {},
        useOrgDefault: false,
      }),
    ).toEqual({});
    expect(resolveEffectivePosThemeColors({ header: "#000000" }, null)).toEqual({ header: "#000000" });
  });

  it("returns stable snapshot references for useSyncExternalStore", () => {
    writePosUserThemePreference(7, 3, { template: "ocean" });
    const first = getPosUserThemePreferenceSnapshot(7, 3);
    const second = getPosUserThemePreferenceSnapshot(7, 3);
    expect(first).toBe(second);
    expect(first).toEqual({ template: "ocean", colors: {}, useOrgDefault: false });
  });
});
