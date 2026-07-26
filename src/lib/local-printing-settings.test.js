import { describe, expect, it } from "vitest";
import {
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

  it("merges module_settings.local_printing", () => {
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
