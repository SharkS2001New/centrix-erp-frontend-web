import { describe, expect, it } from "vitest";
import { injectPrintDocumentBaseline } from "@/lib/print-document-baseline";
import { buildReportPrintHtml, normalizeExportColumns } from "@/lib/reports/export";

describe("print document baseline", () => {
  it("forces zero @page margins so browser headers/footers stay off", () => {
    const html = injectPrintDocumentBaseline(
      "<!DOCTYPE html><html><head><title>Doc</title></head><body class=\"has-doc-print-edge-footer\">x</body></html>",
    );

    expect(html).toContain('id="centrix-print-baseline"');
    // Default @page must not force portrait size — that overrode landscape reports.
    expect(html).toMatch(/@page\s*\{\s*margin:\s*0\s*!important/);
    expect(html).not.toMatch(/@page\s*\{\s*size:\s*A4/);
    expect(html).toMatch(/@page\s+centrix-edge\s*\{[^}]*size:\s*210mm\s+297mm/);
    expect(html).toMatch(/@page\s+centrix-edge\s*\{[^}]*margin:\s*0\s*!important/);
    // Named landscape page removed — caused content to print rotated on some engines.
    expect(html).not.toContain("centrix-landscape");
    expect(html).not.toContain("centrix-print-landscape");
    // Clearance for the fixed edge footer must be body padding, not @page bottom margin.
    expect(html).toMatch(
      /body\.has-doc-print-edge-footer\s*\{[^}]*padding:\s*10mm\s+12mm\s+30mm\s+12mm\s*!important/,
    );
  });

  it("preserves landscape payroll sheet size after baseline inject without rotating", () => {
    const columns = normalizeExportColumns(
      Array.from({ length: 12 }, (_, i) => ({
        key: `c${i}`,
        label: `Col ${i}`,
        align: i > 1 ? "right" : "left",
      })),
    );
    const raw = buildReportPrintHtml({
      meta: {
        title: "Payroll sheet",
        orientation: "landscape",
        printedAt: "5 Sep 2026, 21:20",
      },
      columns,
      rows: [Object.fromEntries(columns.map((c) => [c.key, "100"]))],
    });
    const html = injectPrintDocumentBaseline(raw);

    // Explicit landscape page box (width > height) — no "landscape" keyword.
    expect(raw).toContain("size: 297mm 210mm");
    expect(raw).not.toMatch(/size:\s*A4\s+landscape/);
    expect(raw).not.toContain("centrix-print-landscape");
    expect(html).toContain("size: 297mm 210mm");
    expect(html).not.toContain("centrix-landscape");
    expect(html).not.toMatch(/@page\s*\{\s*size:\s*A4/);
  });

  it("does not inject twice", () => {
    const once = injectPrintDocumentBaseline("<html><head></head><body></body></html>");
    const twice = injectPrintDocumentBaseline(once);
    expect(twice.match(/centrix-print-baseline/g)?.length).toBe(1);
  });
});
