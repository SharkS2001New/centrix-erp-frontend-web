import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  PWA_INSTALL_DISMISS_KEY,
  dismissPrompt,
  isPromptDismissed,
  isStandaloneDisplay,
  clearPromptDismiss,
} from "@/lib/pwa-engage";

function mockLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(String(key));
    },
    clear: () => store.clear(),
  };
}

describe("pwa-engage dismiss persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage(),
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats missing key as not dismissed", () => {
    expect(isPromptDismissed(PWA_INSTALL_DISMISS_KEY)).toBe(false);
  });

  it("remembers dismiss for 30 days", () => {
    dismissPrompt(PWA_INSTALL_DISMISS_KEY);
    expect(isPromptDismissed(PWA_INSTALL_DISMISS_KEY)).toBe(true);
  });

  it("expires old dismissals", () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, JSON.stringify({ at: old }));
    expect(isPromptDismissed(PWA_INSTALL_DISMISS_KEY)).toBe(false);
  });

  it("clearPromptDismiss removes the key", () => {
    dismissPrompt(PWA_INSTALL_DISMISS_KEY);
    clearPromptDismiss(PWA_INSTALL_DISMISS_KEY);
    expect(isPromptDismissed(PWA_INSTALL_DISMISS_KEY)).toBe(false);
  });
});

describe("isStandaloneDisplay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when matchMedia reports not standalone", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      localStorage: mockLocalStorage(),
    });
    expect(isStandaloneDisplay()).toBe(false);
  });

  it("returns true for display-mode standalone", () => {
    vi.stubGlobal("window", {
      matchMedia: (query) => ({
        matches: String(query).includes("standalone"),
      }),
      localStorage: mockLocalStorage(),
    });
    expect(isStandaloneDisplay()).toBe(true);
  });
});
