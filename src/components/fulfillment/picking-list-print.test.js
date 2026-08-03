import { describe, expect, it } from "vitest";
import {
  buildPickingListHtml,
  isSalesPickingLayout,
  samplePickingListPreviewData,
} from "./picking-list-print";

describe("isSalesPickingLayout", () => {
  it("uses sales layout from picking list payload", () => {
    expect(isSalesPickingLayout({ layout: "sales" }, null)).toBe(true);
    expect(isSalesPickingLayout({}, "sales")).toBe(true);
    expect(isSalesPickingLayout({}, "distribution")).toBe(false);
  });
});

describe("buildPickingListHtml sales layout", () => {
  it("omits shortage and shows order value total", () => {
    const sample = samplePickingListPreviewData({ salesLayout: true });
    const html = buildPickingListHtml({
      pickingList: sample.pickingList,
      trip: sample.trip,
      layout: "sales",
      includeShelfLocation: false,
    });

    expect(html).toContain("Quantity (W, Retail)");
    expect(html).toContain("Price (W, R)");
    expect(html).toContain("Line amount");
    expect(html).toContain("Totals Value of Order");
    expect(html).not.toContain(">Shortage<");
    expect(html).not.toContain("Total shortage");
    expect(html).toContain("KAMANDE");
    expect(html).toContain("W 10 Bag, R 30 kg");
    expect(html).toContain("(Jane Wanjiku 12 kg, Peter Otieno 10 kg, Mary Akinyi 8 kg)");
    expect(html).toContain("W Ksh 2,250 / Bag · R Ksh 48 / kg");
    expect(html).toContain('<div class="main">KAMANDE</div>\n        </td>');
  });

  it("keeps shortage columns for distribution layout", () => {
    const sample = samplePickingListPreviewData({ salesLayout: false });
    const html = buildPickingListHtml({
      pickingList: sample.pickingList,
      trip: sample.trip,
      layout: "distribution",
      includeShelfLocation: true,
    });

    expect(html).toContain("Shortage");
    expect(html).toContain("Total shortage");
    expect(html).not.toContain("Totals Value of Order");
  });
});
