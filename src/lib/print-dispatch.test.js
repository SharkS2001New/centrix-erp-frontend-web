import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/print-agent", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isPrintAgentEnabled: vi.fn(() => false),
    isPrintAgentRecentlyHealthy: vi.fn(() => false),
    checkPrintAgentHealth: vi.fn(async () => ({ ok: false })),
    printViaAgent: vi.fn(),
    invalidatePrintAgentHealth: vi.fn(),
    getPrintAgentConfig: vi.fn(() => ({
      enabled: true,
      baseUrl: "http://127.0.0.1:9247",
      printerName: "",
      requireAgent: false,
      fallbackToBrowser: true,
      copies: 1,
    })),
  };
});

vi.mock("@/lib/local-print-provider", () => ({
  getLocalPrintProvider: vi.fn(() => "agent"),
  saveLocalPrintProvider: vi.fn((v) => v),
}));

vi.mock("@/lib/open-print-window", () => ({
  openPrintWindow: vi.fn(),
  fillPrintWindow: vi.fn(async () => true),
  openBlankPrintWindow: vi.fn(() => ({ name: "blank" })),
  printWindowFeatures: vi.fn((type) => `features:${type}`),
  PRINT_BLOCKED_MESSAGE: "Printing was blocked.",
}));

vi.mock("@/lib/print-document-baseline", () => ({
  injectPrintDocumentBaseline: (html) => html,
  prepareThermalPrintHtml: (html) => html,
}));

vi.mock("@/lib/qz-tray-print", () => ({
  saveQzTrayConfig: vi.fn(),
  getQzTrayConfig: vi.fn(() => ({})),
}));

import {
  checkPrintAgentHealth,
  isPrintAgentEnabled,
  printViaAgent,
} from "@/lib/print-agent";
import { fillPrintWindow, openBlankPrintWindow } from "@/lib/open-print-window";
import {
  dispatchPrintJob,
  isSaleOrderBrowserPrintWindowRequired,
  openSaleOrderPrintWindow,
  printHtmlDocument,
  shouldUsePrintAgentForDocument,
} from "@/lib/print-dispatch";

describe("sale order print window vs Centrix agent", () => {
  beforeEach(() => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(false);
    vi.mocked(openBlankPrintWindow).mockClear();
  });

  it("uses agent for all document types when agent is enabled", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(true);
    expect(shouldUsePrintAgentForDocument("receipt")).toBe(true);
    expect(shouldUsePrintAgentForDocument("invoice")).toBe(true);
    expect(shouldUsePrintAgentForDocument("proforma")).toBe(true);
    expect(shouldUsePrintAgentForDocument("picking_list")).toBe(true);
  });

  it("does not pre-open a browser window when agent is enabled", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(true);
    expect(openSaleOrderPrintWindow("receipt")).toBeNull();
    expect(openSaleOrderPrintWindow("invoice")).toBeNull();
    expect(openBlankPrintWindow).not.toHaveBeenCalled();
    expect(isSaleOrderBrowserPrintWindowRequired("receipt")).toBe(false);
    expect(isSaleOrderBrowserPrintWindowRequired("invoice")).toBe(false);
  });

  it("opens a browser window when agent is off", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(false);
    expect(openSaleOrderPrintWindow("receipt")).toEqual({ name: "blank" });
    expect(openSaleOrderPrintWindow("invoice")).toEqual({ name: "blank" });
    expect(isSaleOrderBrowserPrintWindowRequired("receipt")).toBe(true);
  });
});

describe("dispatchPrintJob browser fallback", () => {
  beforeEach(() => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(true);
    vi.mocked(checkPrintAgentHealth).mockResolvedValue({ ok: false });
    vi.mocked(printViaAgent).mockReset();
    vi.mocked(openBlankPrintWindow).mockClear().mockReturnValue({ name: "blank" });
    vi.mocked(fillPrintWindow).mockClear().mockResolvedValue(true);
  });

  it("falls back to browser when the agent is offline", async () => {
    const result = await dispatchPrintJob({
      html: "<html><body>Picking list</body></html>",
      jobType: "picking_list",
      provider: "agent",
    });

    expect(printViaAgent).not.toHaveBeenCalled();
    expect(openBlankPrintWindow).toHaveBeenCalled();
    expect(fillPrintWindow).toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: "browser",
      ok: true,
      agentFallback: true,
    });
  });

  it("printHtmlDocument always falls back to browser when agent is missing", async () => {
    const result = await printHtmlDocument("<html><body>LPO</body></html>", {
      jobType: "lpo",
      allowBrowserFallback: false,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("browser");
    expect(openBlankPrintWindow).toHaveBeenCalled();
  });

  it("waits for the print agent to finish receipts before reporting success", async () => {
    vi.mocked(checkPrintAgentHealth).mockResolvedValue({ ok: true });
    vi.mocked(printViaAgent).mockResolvedValue({ ok: true, queued: false });

    const result = await dispatchPrintJob({
      html: "<html><body>Receipt</body></html>",
      jobType: "receipt",
      provider: "agent",
    });

    expect(printViaAgent).toHaveBeenCalledTimes(1);
    expect(printViaAgent).toHaveBeenCalledWith(
      expect.objectContaining({ wait: true }),
    );
    expect(result).toMatchObject({ mode: "agent", ok: true });
  });

  it("falls back visibly after a synchronous receipt print failure without retrying", async () => {
    vi.mocked(checkPrintAgentHealth).mockResolvedValue({ ok: true });
    vi.mocked(printViaAgent).mockRejectedValue(new Error("Configured printer is not visible."));

    const result = await dispatchPrintJob({
      html: "<html><body>Receipt</body></html>",
      jobType: "receipt",
      provider: "agent",
    });

    expect(printViaAgent).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      mode: "browser",
      ok: true,
      agentFallback: true,
      agentError: "Configured printer is not visible.",
    });
  });

  it("keeps non-receipt print jobs queued by default", async () => {
    vi.mocked(checkPrintAgentHealth).mockResolvedValue({ ok: true });
    vi.mocked(printViaAgent).mockResolvedValue({ ok: true, queued: true });

    await dispatchPrintJob({
      html: "<html><body>Invoice</body></html>",
      jobType: "invoice",
      provider: "agent",
    });

    expect(printViaAgent).toHaveBeenCalledWith(
      expect.objectContaining({ wait: false }),
    );
  });
});
