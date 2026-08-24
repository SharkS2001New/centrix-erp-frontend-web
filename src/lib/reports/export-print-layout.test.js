import { describe, expect, it } from "vitest";
import {
  buildReportPrintHtml,
  normalizeExportColumns,
  resolveReportPrintLandscape,
} from "@/lib/reports/export";

describe("resolveReportPrintLandscape", () => {
  it("uses landscape for 6+ table columns", () => {
    const tableColumns = Array.from({ length: 6 }, (_, i) => ({
      key: `c${i}`,
      label: `C${i}`,
      getValue: () => "x",
    }));
    expect(resolveReportPrintLandscape({ tableColumns, rows: [{}] })).toBe(true);
  });

  it("stays portrait for narrow tables with short text", () => {
    const tableColumns = [
      { key: "a", label: "A", getValue: (r) => r.a },
      { key: "b", label: "B", getValue: (r) => r.b, align: "right" },
    ];
    expect(
      resolveReportPrintLandscape({
        tableColumns,
        rows: [{ a: "short", b: "1.00" }],
      }),
    ).toBe(false);
  });

  it("uses landscape when long unbroken document refs appear", () => {
    const tableColumns = [
      { key: "document", label: "Document", getValue: (r) => r.document },
      { key: "amount", label: "Amount", getValue: (r) => r.amount, align: "right" },
    ];
    expect(
      resolveReportPrintLandscape({
        tableColumns,
        rows: [{ document: "UGBTQZ0GUY,UGBOIA0JBG,UGBTQ28DKD", amount: "100" }],
      }),
    ).toBe(true);
  });

  it("honors explicit orientation", () => {
    expect(resolveReportPrintLandscape({ tableColumns: [], orientation: "landscape" })).toBe(true);
    expect(
      resolveReportPrintLandscape({
        tableColumns: Array.from({ length: 8 }, () => ({})),
        orientation: "portrait",
      }),
    ).toBe(false);
  });
});

describe("buildReportPrintHtml statement layout", () => {
  it("prints customer statements in landscape with wrapping text cells", () => {
    const columns = normalizeExportColumns([
      { key: "date", label: "Date" },
      { key: "document", label: "Document No", wrap: true },
      { key: "description", label: "Description", wrap: true },
      { key: "debit", label: "Debit", align: "right" },
      { key: "credit", label: "Credit", align: "right" },
      { key: "balance", label: "Balance", align: "right" },
    ]);
    const html = buildReportPrintHtml({
      meta: {
        title: "Customer Statement",
        subtitle: "Running balance from invoices, returns, and payments",
        orientation: "landscape",
        printedAt: "24 Aug 2026, 14:33",
      },
      columns,
      rows: [
        {
          date: "2026-07-09",
          document: "UGBTQZ0GUY,UGBOIA0JBG",
          description: "Payment UGBTQ28DKD,UGBTQ285NL",
          debit: "",
          credit: "1,000.00",
          balance: "5,000.00",
        },
      ],
    });

    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain('class="wrap"');
    expect(html).toContain("UGBTQZ0GUY,UGBOIA0JBG");
    expect(html).toContain('class="num"');
  });
});
