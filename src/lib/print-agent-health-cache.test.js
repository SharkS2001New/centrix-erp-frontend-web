import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkPrintAgentHealth,
  clearPrintAgentHealthCache,
  invalidatePrintAgentHealth,
  isPrintAgentRecentlyHealthy,
  markPrintAgentHealthy,
} from "@/lib/print-agent";

const config = {
  enabled: true,
  baseUrl: "http://127.0.0.1:9247",
  printerName: "",
  requireAgent: false,
  fallbackToBrowser: true,
  copies: 1,
};

describe("print agent health cache", () => {
  beforeEach(() => {
    clearPrintAgentHealthCache();
    vi.unstubAllGlobals();
  });

  it("treats a recent healthy mark as warm", () => {
    expect(isPrintAgentRecentlyHealthy(config)).toBe(false);
    markPrintAgentHealthy(config, { ok: true, version: "1" });
    expect(isPrintAgentRecentlyHealthy(config)).toBe(true);
  });

  it("invalidates after a failed print path", () => {
    markPrintAgentHealthy(config);
    invalidatePrintAgentHealth(config);
    expect(isPrintAgentRecentlyHealthy(config)).toBe(false);
  });

  it("reports when renderers or printers are missing from the health response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            ok: true,
            wkhtmltopdf_available: true,
            wkhtmltopdf_path: "C:\\PrintAgent\\tools\\wkhtmltopdf\\bin\\wkhtmltopdf.exe",
            sumatra_available: true,
            sumatra_path: "C:\\PrintAgent\\tools\\SumatraPDF\\SumatraPDF.exe",
            printer_count: 0,
            print_ready: false,
            printers: [],
          }),
      })),
    );

    const health = await checkPrintAgentHealth(config, { bypassCache: true });

    expect(health).toMatchObject({
      ok: true,
      wkhtmltopdfAvailable: true,
      wkhtmltopdfPath: "C:\\PrintAgent\\tools\\wkhtmltopdf\\bin\\wkhtmltopdf.exe",
      sumatraAvailable: true,
      printReady: false,
      printers: [],
    });
  });
});
