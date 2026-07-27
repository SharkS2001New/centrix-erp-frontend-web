import { describe, expect, it } from "vitest";
import {
  buildStyledFooterLinesHtml,
  parseFooterLines,
  serializeFooterLines,
} from "@/lib/footer-line-format";

describe("footer line format", () => {
  it("renders thermal footer alignment from inline styles", () => {
    const html = buildStyledFooterLinesHtml(
      [{ text: "Left line", align: "left", bold: false, italic: false, size: "md" }],
      { layout: "thermal" },
    );
    expect(html).toContain('style="text-align:left');
    expect(html).not.toContain('text-align:center');
  });

  it("renders optional dashed divider after a footer line", () => {
    const html = buildStyledFooterLinesHtml(
      [
        {
          text: "Please Confirm Your Goods",
          align: "center",
          bold: false,
          italic: false,
          size: "md",
          dividerAfter: true,
        },
      ],
      { layout: "thermal" },
    );
    expect(html).toContain('class="divider footer-line-divider"');
  });

  it("round-trips dividerAfter through JSON storage", () => {
    const stored = serializeFooterLines(
      [
        {
          text: "Thankyou For Shopping With Us",
          align: "center",
          bold: false,
          italic: false,
          size: "md",
          dividerAfter: true,
        },
      ],
      { forEditor: true },
    );
    const parsed = parseFooterLines(stored, { includeEmpty: true });
    expect(parsed[0].dividerAfter).toBe(true);
  });
});
