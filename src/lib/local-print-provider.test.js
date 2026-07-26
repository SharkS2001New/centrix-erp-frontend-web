import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalPrintProvider,
  normalizeLocalPrintProvider,
  saveLocalPrintProvider,
} from "@/lib/local-print-provider";

describe("local-print-provider", () => {
  beforeEach(() => {
    const store = new Map();
    const localStorage = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);
  });

  it("normalizes provider aliases", () => {
    expect(normalizeLocalPrintProvider("qz-tray")).toBe("qz");
    expect(normalizeLocalPrintProvider("print-agent")).toBe("centrix");
    expect(normalizeLocalPrintProvider("anything")).toBe("browser");
  });

  it("persists the selected provider", () => {
    expect(saveLocalPrintProvider("qz")).toBe("qz");
    expect(getLocalPrintProvider()).toBe("qz");
  });

  it("migrates from an enabled Centrix agent config", () => {
    localStorage.setItem(
      "centrix_print_agent_v1",
      JSON.stringify({ enabled: true, baseUrl: "http://127.0.0.1:9247" }),
    );
    expect(getLocalPrintProvider()).toBe("centrix");
  });
});
