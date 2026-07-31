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
    expect(html).toContain("(5 kg ×4, 3 kg ×2, 4 kg ×2)");
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
