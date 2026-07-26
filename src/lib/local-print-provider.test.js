import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalPrintProvider,
  normalizeLocalPrintProvider,
  saveLocalPrintProvider,
} from "@/lib/local-print-provider";
import {
  setCachedLocalPrintingSettings,
  syncLocalPrintingFromCapabilities,
} from "@/lib/local-printing-settings";

describe("local-print-provider (org settings)", () => {
  beforeEach(() => {
    setCachedLocalPrintingSettings({ provider: "browser" });
  });

  it("normalizes provider aliases", () => {
    expect(normalizeLocalPrintProvider("qz-tray")).toBe("qz");
    expect(normalizeLocalPrintProvider("print-agent")).toBe("browser");
    expect(normalizeLocalPrintProvider("centrix")).toBe("browser");
  });

  it("reads provider from the org cache", () => {
    setCachedLocalPrintingSettings({ provider: "qz", printer_name: "TM-T20" });
    expect(getLocalPrintProvider()).toBe("qz");
    expect(saveLocalPrintProvider("browser")).toBe("browser");
    expect(getLocalPrintProvider()).toBe("browser");
  });

  it("syncs from capabilities module_settings", () => {
    syncLocalPrintingFromCapabilities({
      module_settings: {
        local_printing: {
          provider: "qz",
          printer_name: "Star TSP143",
        },
      },
    });
    expect(getLocalPrintProvider()).toBe("qz");
  });
});
