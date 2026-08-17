import { describe, expect, it, vi, beforeEach } from "vitest";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { createOrgPrintPx } from "@/lib/print-typography";
import { THERMAL_CONTENT_WIDTH_MM } from "@/lib/thermal-receipt-layout";
import {
  buildHospitalityCheckReceiptHtml,
  printHospitalityCheckReceipt,
  resolveGuestCheckTitle,
  sampleHospitalityCheckPreviewData,
} from "./hospitality-check-receipt-print";

vi.mock("@/lib/print-dispatch", () => ({
  dispatchPrintJob: vi.fn(async () => ({ mode: "agent", ok: true, printer: "Star TSP143" })),
}));

vi.mock("@/lib/print-agent", () => ({
  getPrintAgentConfig: vi.fn(() => ({
    enabled: true,
    baseUrl: "http://127.0.0.1:9247",
    printerName: "Star TSP143",
  })),
  printViaAgent: vi.fn(async () => ({ ok: true, jobId: "kitchen-1" })),
}));

vi.mock("@/lib/local-printing-settings", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveHotelKitchenPrinterName: vi.fn(() => ""),
  };
});

import { dispatchPrintJob } from "@/lib/print-dispatch";
import { printViaAgent } from "@/lib/print-agent";
import { resolveHotelKitchenPrinterName } from "@/lib/local-printing-settings";

const paidCheck = {
  id: 12,
  check_number: "HTL-9",
  status: "paid",
  lines: [{ description: "Soda", qty: 1, unit_price: 150, line_total: 150 }],
  total: 150,
};

describe("resolveGuestCheckTitle", () => {
  it("prints VOID ORDER for a voided check even if the caller passed an unpaid title", () => {
    expect(resolveGuestCheckTitle("Unpaid order", { status: "void" }, "void")).toBe("VOID ORDER");
  });

  it("prints VOID ORDER for a voided paid receipt reprint", () => {
    expect(resolveGuestCheckTitle("Paid receipt", { status: "void" }, "void")).toBe("VOID ORDER");
  });
});

describe("printHospitalityCheckReceipt", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.mocked(dispatchPrintJob).mockClear().mockResolvedValue({
      mode: "agent",
      ok: true,
      printer: "Star TSP143",
    });
    vi.mocked(printViaAgent).mockClear().mockResolvedValue({ ok: true, jobId: "kitchen-1" });
    vi.mocked(resolveHotelKitchenPrinterName).mockReturnValue("");
  });

  it("sends the check through Centrix Print Agent dispatch (silent when agent is on)", async () => {
    const result = await printHospitalityCheckReceipt(paidCheck, {
      title: "Paid receipt",
      printSettings: { check_receipt_copies: 1 },
    });

    expect(dispatchPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "receipt",
        documentId: 12,
        copies: 1,
        wait: true,
      }),
    );
    expect(printViaAgent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: "agent", ok: true });
  });

  it("sends a second copy to the kitchen printer when configured", async () => {
    vi.mocked(resolveHotelKitchenPrinterName).mockReturnValue("Kitchen EPSON");

    const result = await printHospitalityCheckReceipt(paidCheck, {
      title: "Paid receipt",
      printSettings: { check_receipt_copies: 2 },
    });

    expect(dispatchPrintJob).toHaveBeenCalledWith(expect.objectContaining({ copies: 2 }));
    expect(printViaAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        copies: 1,
        jobType: "receipt",
        documentId: 12,
        wait: true,
        config: expect.objectContaining({ enabled: true, printerName: "Kitchen EPSON" }),
      }),
    );
    expect(result).toMatchObject({
      mode: "agent",
      ok: true,
      kitchen: { ok: true, printer: "Kitchen EPSON" },
    });
  });

  it("does not print kitchen when the guest receipt used the browser dialog", async () => {
    vi.mocked(resolveHotelKitchenPrinterName).mockReturnValue("Kitchen EPSON");
    vi.mocked(dispatchPrintJob).mockResolvedValue({ mode: "browser", ok: true });

    const result = await printHospitalityCheckReceipt(paidCheck, {
      title: "Paid receipt",
    });

    expect(printViaAgent).not.toHaveBeenCalled();
    expect(result.kitchen).toBeUndefined();
  });
});

describe("buildHospitalityCheckReceiptHtml", () => {
  const checkWithGuest = {
    ...sampleHospitalityCheckPreviewData(),
    guest_name: "Jane Guest",
    folio: { guest_name: "Jane Guest", room_number: "101", folio_number: "F-9" },
    lines: [
      ...sampleHospitalityCheckPreviewData().lines,
      {
        description: "Room stay",
        qty: 1,
        unit_price: 8000,
        line_total: 8000,
        is_room_stay: true,
        modifiers: { type: "room_stay", room_number: "101", nights: 2 },
      },
    ],
  };

  it("hides guest/customer name by default even when room, folio, or nights are present", () => {
    const html = buildHospitalityCheckReceiptHtml(checkWithGuest, { printSettings: {} });

    expect(html).not.toContain("Guest:");
    expect(html).not.toContain("Customer Name:");
    expect(html).not.toContain("JANE GUEST");
    expect(html).not.toContain("Jane Guest");
    expect(html).toContain("Room:");
    expect(html).toContain("Folio:");
    expect(html).toContain("Nights:");
  });

  it("prints guest name only when enable_check_guest_name is on", () => {
    const html = buildHospitalityCheckReceiptHtml(checkWithGuest, {
      printSettings: { enable_check_guest_name: true },
    });

    expect(html).toContain('<span class="meta-label">Guest:</span> JANE GUEST');
  });

  it("uses hotel check font settings on the same 80mm thermal layout as retail", () => {
    const general = mergeGeneralSettings({
      general: {
        print_font_receipt_family: "courier",
        print_font_receipt_scale: "large",
        print_font_hospitality_check_family: "georgia",
        print_font_hospitality_check_scale: "compact",
      },
    });
    const html = buildHospitalityCheckReceiptHtml(sampleHospitalityCheckPreviewData(), {
      generalSettings: general,
      seller: { name: "Test Org" },
    });
    const printPx = createOrgPrintPx(general, "thermal_check");

    expect(html).toContain("Georgia");
    expect(html).not.toContain("Courier");
    expect(html).toContain(`font-size: ${printPx.body(10)}`);
    expect(html).toContain(`font-size: ${printPx.body(11)}`);
    expect(html).toContain(`width: ${THERMAL_CONTENT_WIDTH_MM}mm`);
    expect(html).toContain("letter-spacing: .08em; margin: 10px 0 8px;");
    expect(html).toContain(".table col.col-desc { width: 44%; }");
    expect(html).toContain(".table col.col-qty { width: 12%; }");
    expect(html).toContain(".table col.col-price { width: 18%; }");
    expect(html).toContain(".table col.col-amount { width: 26%; }");
    expect(html).toContain(
      ".meta-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 4px;",
    );
    expect(html).not.toContain("letter-spacing: .1em; margin: 8px 0 2px; text-transform: uppercase");
  });
});
