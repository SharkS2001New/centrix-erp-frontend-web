import { beforeEach, describe, expect, it } from "vitest";
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
    expect(normalizeLocalPrintProvider("qz-tray")).toBe("browser");
    expect(normalizeLocalPrintProvider("qz")).toBe("browser");
    expect(normalizeLocalPrintProvider("print-agent")).toBe("agent");
    expect(normalizeLocalPrintProvider("print_agent")).toBe("agent");
    expect(normalizeLocalPrintProvider("agent")).toBe("agent");
    expect(normalizeLocalPrintProvider("centrix")).toBe("browser");
  });

  it("reads provider from the org cache", () => {
    setCachedLocalPrintingSettings({ provider: "agent", printer_name: "TM-T20" });
    expect(getLocalPrintProvider()).toBe("agent");
    expect(saveLocalPrintProvider("browser")).toBe("browser");
    expect(getLocalPrintProvider()).toBe("browser");
  });

  it("syncs agent from capabilities module_settings", () => {
    syncLocalPrintingFromCapabilities({
      module_settings: {
        local_printing: {
          provider: "agent",
          printer_name: "Star TSP143",
        },
      },
    });
    expect(getLocalPrintProvider()).toBe("agent");
  });
});
