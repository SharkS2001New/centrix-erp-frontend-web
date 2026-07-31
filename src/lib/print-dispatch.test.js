import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/print-agent", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isPrintAgentEnabled: vi.fn(() => false),
  };
});

vi.mock("@/lib/open-print-window", () => ({
  openPrintWindow: vi.fn(),
  fillPrintWindow: vi.fn(),
  openBlankPrintWindow: vi.fn(() => ({ name: "blank" })),
  printWindowFeatures: vi.fn((type) => `features:${type}`),
}));

import { isPrintAgentEnabled } from "@/lib/print-agent";
import { openBlankPrintWindow } from "@/lib/open-print-window";
import {
  isSaleOrderBrowserPrintWindowRequired,
  openSaleOrderPrintWindow,
  shouldUsePrintAgentForDocument,
} from "@/lib/print-dispatch";

describe("sale order print window vs Centrix agent", () => {
  beforeEach(() => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(false);
    vi.mocked(openBlankPrintWindow).mockClear();
  });

  it("uses agent only for thermal receipts when agent is enabled", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(true);
    expect(shouldUsePrintAgentForDocument("receipt")).toBe(true);
    expect(shouldUsePrintAgentForDocument("invoice")).toBe(false);
    expect(shouldUsePrintAgentForDocument("proforma")).toBe(false);
  });

  it("does not pre-open a browser window for thermal when agent is enabled", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(true);
    expect(openSaleOrderPrintWindow("receipt")).toBeNull();
    expect(openBlankPrintWindow).not.toHaveBeenCalled();
    expect(isSaleOrderBrowserPrintWindowRequired("receipt")).toBe(false);
  });

  it("still opens a browser window for A4 invoices when agent is enabled", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(true);
    expect(openSaleOrderPrintWindow("invoice")).toEqual({ name: "blank" });
    expect(isSaleOrderBrowserPrintWindowRequired("invoice")).toBe(true);
  });

  it("opens a browser window for thermal when agent is off", () => {
    vi.mocked(isPrintAgentEnabled).mockReturnValue(false);
    expect(openSaleOrderPrintWindow("receipt")).toEqual({ name: "blank" });
    expect(isSaleOrderBrowserPrintWindowRequired("receipt")).toBe(true);
  });
});
