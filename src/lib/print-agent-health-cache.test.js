import { beforeEach, describe, expect, it } from "vitest";
import {
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
});
