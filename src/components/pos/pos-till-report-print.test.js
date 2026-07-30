import { describe, expect, it, vi } from "vitest";
import { buildPosTillReportHtml } from "@/components/pos/pos-shared";
import { resolveTillReportNo, resolveTillPaymentSummary, resolveTillReportPaymentLines, resolveTillSalesSummaryRows } from "@/lib/pos-till";
import { createOrgPrintPx, orgPrintFontFamilyFromSettings } from "@/lib/print-typography";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { THERMAL_CONTENT_WIDTH_MM, THERMAL_PAPER_WIDTH_MM } from "@/lib/thermal-receipt-layout";

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
    gross_sales: 23510,
    net_sales: 23510,
    expected_net_sales: 10017320,
    net_sales_minus_expenses: 10017320,
    net_sales_minus_vat: 10017320,
    net_sales_minus_float: 10017320,
    total_vat: 1110,
    refunds: 0,
    cash: 10000,
    mpesa: 8000,
    equity: 5510,
    debtor_collections: 2500,
  },
  payments: [
    { method_code: "CASH", method_name: "Cash", total: 10000 },
    { method_code: "MPESA", method_name: "M-Pesa", total: 8000 },
    { method_code: "EQUITY", method_name: "Equity", total: 5510 },
  ],
  session_expenses: 4400,
  till: {
    opening_float: 9998210,
    cash_collected: 23510,
    gross_total: 10021720,
    session_expenses: 4400,
  },
  expected_cash: 10017320,
  expected_net_sales: 10017320,
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

describe("resolveTillPaymentSummary", () => {
  it("uses backend payment rows when provided", () => {
    const rows = resolveTillPaymentSummary({
      sales: { cash: 160778, mpesa: 0, equity: 0 },
      payments: [
        { method_code: "CASH", method_name: "Cash", total: 80000 },
        { method_code: "MPESA", method_name: "M-Pesa", total: 50000 },
        { method_code: "EQUITY", method_name: "Equity", total: 30778 },
      ],
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method_code: "CASH", total: 80000 }),
        expect.objectContaining({ method_code: "MPESA", total: 50000 }),
        expect.objectContaining({ method_code: "EQUITY", total: 30778 }),
      ]),
    );
  });

  it("falls back to sales-column splits when payments are missing", () => {
    const rows = resolveTillPaymentSummary({
      sales: { cash: 400, mpesa: 300, equity: 300, kcb: 0 },
      payments: [],
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method_code: "CASH", total: 400 }),
        expect.objectContaining({ method_code: "MPESA", total: 300 }),
        expect.objectContaining({ method_code: "EQUITY", total: 300 }),
      ]),
    );
  });
});

describe("resolveTillReportNo", () => {
  it("prefers till_number and falls back to session till id", () => {
    expect(resolveTillReportNo({ till: { till_number: "Till01" } })).toBe("Till01");
    expect(resolveTillReportNo({ report: { till: { till_number: "Till03" } } })).toBe("Till03");
    expect(resolveTillReportNo({ session: { till_id: 5 } })).toBe("Till #5");
    expect(resolveTillReportNo({})).toBe("—");
  });
});

describe("resolveTillReportPaymentLines", () => {
  it("always returns the four standard tender lines", () => {
    const rows = resolveTillReportPaymentLines(sampleReport);
    expect(rows.map((row) => row.label)).toEqual([
      "Cash payment",
      "M-Pesa payments",
      "Equity payment",
      "K.C.B payment",
    ]);
    expect(rows.find((row) => row.method_code === "CASH")?.total).toBe(10000);
    expect(rows.find((row) => row.method_code === "KCB")?.total).toBe(0);
  });
});

describe("resolveTillSalesSummaryRows", () => {
  it("shows gross sales and expected amount (net sales − expenses, excluding float)", () => {
    const rows = resolveTillSalesSummaryRows(sampleReport, sampleSession, { showFloatBreakdown: true });
    expect(rows.map((row) => row.label)).toEqual([
      "Gross sales",
      "Expected Amount",
    ]);
    expect(rows[0]?.amount).toBe(23510);
    expect(rows[1]?.amount).toBe(19110); // 23510 − 4400; ignores float-inclusive backend fields
    expect(rows[0]?.hint).toBeUndefined();
    expect(rows[1]?.hint).toBeUndefined();
  });

  it("computes expected amount as net sales − expenses", () => {
    const rows = resolveTillSalesSummaryRows(
      {
        sales: { gross_sales: 10000, net_sales: 10000 },
        session_expenses: 1500,
        till: { session_expenses: 1500 },
      },
      sampleSession,
    );
    expect(rows).toEqual([
      { label: "Gross sales", amount: 10000 },
      { label: "Expected Amount", amount: 8500 },
    ]);
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
    expect(html).toContain(`width: ${THERMAL_CONTENT_WIDTH_MM}mm`);
    expect(html).toContain('class="centrix-print-thermal"');
    expect(html).toContain(orgPrintFontFamilyFromSettings(general, "thermal"));
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "thermal").body(10)}`);
    expect(html).toContain(`font-size: ${createOrgPrintPx(general, "thermal").body(8)}`);
    expect(html).not.toContain("max-width: 0");
    expect(html).toContain("Till No:");
    expect(html).toContain("Till 1");
    expect(html).toContain("9,998,210");
    expect(html).toContain("23,510");
    expect(html).toContain("10,017,320");
    expect(html).not.toContain("max-width: 280px");
    expect(html).toContain('class="section-row');
    expect(html).toContain("Operating float");
    expect(html).toContain("Payment summary");
    expect(html).toContain("Cash payment");
    expect(html).toContain("M-Pesa payments");
    expect(html).toContain("Total paid debtors");
    expect(html).toContain("Sales summary");
    expect(html).toContain("Gross sales");
    expect(html).toContain("Expected Amount");
    expect(html).toContain("Total expenses");
    expect(html).not.toContain("Expected net sales");
    expect(html).not.toContain("Opening float + total sales");
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
      showFloatBreakdown: true,
    });
    expect(html).toContain("Z REPORT");
    expect(html).toContain("SESSION CLOSED");
    expect(html).not.toContain("SESSION STILL OPEN");
    expect(html).toContain("Payment summary");
    expect(html).toContain("Cash payment");
    expect(html).toContain("M-Pesa payments");
    expect(html).toContain("Equity payment");
    expect(html).toContain("K.C.B payment");
    expect(html).toContain("Total paid debtors");
    expect(html).toContain("Total expenses");
    expect(html).toContain("Sales summary");
    expect(html).toContain("Gross sales");
    expect(html).toContain("Expected Amount");
    expect(html).not.toContain("Expected net sales");
    expect(html).toContain("Expected Cash");
    expect(html).toContain("Actual Cash");
    expect(html).toContain("Variance");
  });

  it("prints X and Z with the same summary sections in order", () => {
    const common = {
      organizationName: "Test Org",
      tillName: "Till03",
      cashierName: "Cashier",
      report: sampleReport,
      session: sampleSession,
      showFloatBreakdown: true,
    };
    const xHtml = buildPosTillReportHtml({ ...common, type: "X" });
    const zHtml = buildPosTillReportHtml({
      ...common,
      type: "Z",
      session: { ...sampleSession, closed_at: "2026-07-28T18:00:00Z", closing_amount: 100 },
      variance: 0,
    });

    for (const html of [xHtml, zHtml]) {
      const paymentIdx = html.indexOf("Payment summary");
      const expensesIdx = html.indexOf("Total expenses");
      const salesSummaryIdx = html.indexOf("Sales summary");
      const cashIdx = html.indexOf(">Cash<");
      expect(paymentIdx).toBeGreaterThan(-1);
      expect(expensesIdx).toBeGreaterThan(paymentIdx);
      expect(salesSummaryIdx).toBeGreaterThan(expensesIdx);
      expect(cashIdx).toBeGreaterThan(salesSummaryIdx);
      expect(html).not.toContain(">Sales<");
    }
  });
});
