import { describe, expect, it } from "vitest";
import {
  agentConfigFromLocalPrinting,
  mergeLocalPrintingSettings,
  normalizeLocalPrintingSettings,
  qzConfigFromLocalPrinting,
} from "@/lib/local-printing-settings";

describe("local-printing-settings", () => {
  it("defaults to browser", () => {
    expect(normalizeLocalPrintingSettings({})).toMatchObject({
      provider: "browser",
      fallback_to_browser: true,
      require_qz: false,
    });
  });

  it("merges module_settings.local_printing for qz", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: { provider: "qz", printer_name: "EPSON", use_signing: true },
    });
    expect(merged.provider).toBe("qz");
    expect(merged.printer_name).toBe("EPSON");
    expect(merged.use_signing).toBe(true);
    expect(qzConfigFromLocalPrinting(merged)).toMatchObject({
      enabled: true,
      printerName: "EPSON",
      useSigning: true,
    });
  });

  it("merges module_settings.local_printing for agent", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: { provider: "print-agent", printer_name: "Star TSP143" },
    });
    expect(merged.provider).toBe("agent");
    expect(agentConfigFromLocalPrinting(merged)).toMatchObject({
      enabled: true,
      printerName: "Star TSP143",
      baseUrl: "http://127.0.0.1:9247",
    });
    expect(qzConfigFromLocalPrinting(merged).enabled).toBe(false);
  });

  it("always keeps browser fallback on", () => {
    const merged = mergeLocalPrintingSettings({
      local_printing: {
        provider: "qz",
        fallback_to_browser: false,
        require_qz: true,
      },
    });
    expect(merged.fallback_to_browser).toBe(true);
    expect(merged.require_qz).toBe(false);
  });
});
