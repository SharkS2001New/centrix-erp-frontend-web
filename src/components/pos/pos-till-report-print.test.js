import { describe, expect, it, vi } from "vitest";
import { buildPosTillReportHtml } from "@/components/pos/pos-shared";
import { resolveTillReportNo } from "@/lib/pos-till";
import { createOrgPrintPx, orgPrintFontFamilyFromSettings } from "@/lib/print-typography";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { THERMAL_PAPER_WIDTH_MM } from "@/lib/thermal-receipt-layout";

vi.mock("@/lib/print-dispatch", () => ({
  dispatchPrintJob: vi.fn(async () => ({ mode: "browser", ok: true })),
}));

vi.mock("@/lib/print-module-settings", () => ({
  fetchPrintModuleSettings: vi.fn(async () => ({})),
  resolvePrintGeneralSettings: vi.fn(() => mergeGeneralSettings({ general: {} })),
}));

const sampleReport = {
  sales: {
    transactions: 3,
    net_sales: 23510,
    refunds: 0,
    cash: 23510,
  },
  till: {
    opening_float: 9998210,
    cash_collected: 23510,
    gross_total: 10021720,
  },
  expected_cash: 10021720,
  float_entries: [
    { payment_type: "EQUITY", new_float: 5000000, date_added: "2026-07-29T08:33:00Z" },
    { payment_type: "CASH", new_float: 4998210, date_added: "2026-07-29T08:34:00Z" },
  ],
};

const sampleSession = {
  id: 42,
  opened_at: "2026-07-28T08:00:00Z",
  working_amount: 9998210,
};

describe("resolveTillReportNo", () => {
  it("prefers till_number and falls back to session till id", () => {
    expect(resolveTillReportNo({ till: { till_number: "Till01" } })).toBe("Till01");
    expect(resolveTillReportNo({ report: { till: { till_number: "Till03" } } })).toBe("Till03");
    expect(resolveTillReportNo({ session: { till_id: 5 } })).toBe("Till #5");
    expect(resolveTillReportNo({})).toBe("—");
  });
});

describe("buildPosTillReportHtml", () => {
  it("uses 80mm thermal layout and receipt font settings", () => {
    const general = mergeGeneralSettings({
      general: {
        print_font_receipt_family: "Courier New",
        print_font_receipt_scale: 100,
      },
    });
    const html = buildPosTillReportHtml({
      type: "X",
      organizationName: "Moonlight Express Ltd",
      tillName: "Till 1",
      cashierName: "Naomi Nyambura",
      report: sampleReport,
      session: sampleSession,
      showFloatBreakdown: true,
      generalSettings: general,
    });

    expect(html).toContain(`size: ${THERMAL_PAPER_WIDTH_MM}mm auto`);
    expect(html).toContain('class="centrix-print-thermal"');
    expect(html).toContain(orgPrintFontFamilyFromSettings(general, "thermal"));
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "thermal").body(10)}`);
    expect(html).toContain("Till No:");
    expect(html).toContain("Till 1");
    expect(html).toContain("9,998,210");
    expect(html).toContain("23,510");
    expect(html).toContain("10,021,720");
    expect(html).not.toContain("max-width: 280px");
    expect(html).toContain('class="section-row');
    expect(html).toContain("Operating float");
    expect(html).toContain("Payment summary");
    expect(html).toMatch(/<table class="summary-table">[\s\S]*Operating float[\s\S]*Payment summary[\s\S]*<\/table>/);
    expect(html).toContain("page: centrix-thermal");
    expect(html).toContain("break-inside: avoid-page");
  });

  it("marks Z reports as session closed", () => {
    const html = buildPosTillReportHtml({
      type: "Z",
      report: { ...sampleReport, expected_cash: 100 },
      session: { ...sampleSession, closed_at: "2026-07-28T18:00:00Z", closing_amount: 100 },
      variance: 0,
    });
    expect(html).toContain("Z REPORT");
    expect(html).toContain("SESSION CLOSED");
  });
});
