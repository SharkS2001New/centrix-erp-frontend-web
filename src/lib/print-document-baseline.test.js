import { describe, expect, it } from "vitest";
import { injectPrintDocumentBaseline } from "@/lib/print-document-baseline";

describe("print document baseline", () => {
  it("forces zero @page margins so browser headers/footers stay off", () => {
    const html = injectPrintDocumentBaseline(
      "<!DOCTYPE html><html><head><title>Doc</title></head><body class=\"has-doc-print-edge-footer\">x</body></html>",
    );

    expect(html).toContain('id="centrix-print-baseline"');
    expect(html).toMatch(/@page\s*\{[^}]*margin:\s*0\s*!important/);
    expect(html).toMatch(/@page\s+centrix-edge\s*\{[^}]*margin:\s*0\s*!important/);
    // Clearance for the fixed edge footer must be body padding, not @page bottom margin.
    expect(html).toMatch(
      /body\.has-doc-print-edge-footer\s*\{[^}]*padding:\s*10mm\s+12mm\s+30mm\s+12mm\s*!important/,
    );
  });

  it("does not inject twice", () => {
    const once = injectPrintDocumentBaseline("<html><head></head><body></body></html>");
    const twice = injectPrintDocumentBaseline(once);
    expect(twice.match(/centrix-print-baseline/g)?.length).toBe(1);
  });
});
