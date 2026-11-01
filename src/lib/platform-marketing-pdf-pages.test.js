import { describe, expect, it } from "vitest";
import { portfolioPdfPageRanges } from "@/lib/platform-marketing-pdf-pages";

describe("portfolio PDF pagination", () => {
  it("breaks between content blocks instead of splitting a section", () => {
    const pageHeight = Math.floor((1240 * 297) / 210);
    const blocks = [
      { start: 0, end: 520 },
      { start: 548, end: 1050 },
      { start: 1078, end: 1580 },
      { start: 1608, end: 2100 },
      { start: 2150, end: 2200 },
    ];

    const pages = portfolioPdfPageRanges(1240, 2200, blocks);

    expect(pages).toHaveLength(2);
    expect(pages[0].y).toBe(0);
    expect(pages[0].y + pages[0].height).toBe(blocks[3].start);
    expect(pages[1].y).toBe(blocks[3].start);
    expect(pages[1].y + pages[1].height).toBe(2200);
    expect(pages.every((page) => page.height <= pageHeight)).toBe(true);
  });

  it("keeps an unusually tall section intact and scales it to a page", () => {
    const pages = portfolioPdfPageRanges(1240, 3000, [
      { start: 0, end: 520 },
      { start: 548, end: 2600 },
      { start: 2628, end: 2700 },
    ]);

    expect(pages).toEqual([
      { y: 0, height: 548 },
      { y: 548, height: 2052, fitToPage: true },
      { y: 2600, height: 400 },
    ]);
  });

  it("falls back to page-height slices when no content blocks are provided", () => {
    const pageHeight = Math.floor((1240 * 297) / 210);
    const pages = portfolioPdfPageRanges(1240, pageHeight + 100);

    expect(pages).toEqual([
      { y: 0, height: pageHeight },
      { y: pageHeight, height: 100 },
    ]);
  });
});
