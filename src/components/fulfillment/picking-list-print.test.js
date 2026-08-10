import { describe, expect, it } from "vitest";
import {
  buildPickingListHtml,
  chunkPickingLinesForPrint,
  formatRouteNamesPhrase,
  isSalesPickingLayout,
  PICKING_LIST_LINES_PER_PAGE,
  samplePickingListPreviewData,
} from "./picking-list-print";

describe("formatRouteNamesPhrase", () => {
  it("joins two and three-plus route names naturally", () => {
    expect(formatRouteNamesPhrase(["Route A"])).toBe("Route A");
    expect(formatRouteNamesPhrase(["Route A", "Route B"])).toBe("Route A and Route B");
    expect(formatRouteNamesPhrase(["Route 1", "2", "C"])).toBe("Route 1, 2 and C");
  });
});

describe("isSalesPickingLayout", () => {
  it("uses sales layout from picking list payload", () => {
    expect(isSalesPickingLayout({ layout: "sales" }, null)).toBe(true);
    expect(isSalesPickingLayout({}, "sales")).toBe(true);
    expect(isSalesPickingLayout({}, "distribution")).toBe(false);
  });
});

describe("chunkPickingLinesForPrint", () => {
  it("pages lines at 24 per sheet by default", () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ line_no: i + 1 }));
    const chunks = chunkPickingLinesForPrint(lines);
    expect(PICKING_LIST_LINES_PER_PAGE).toBe(24);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(24);
    expect(chunks[1]).toHaveLength(24);
    expect(chunks[2]).toHaveLength(2);
  });

  it("returns one empty chunk when there are no lines", () => {
    expect(chunkPickingLinesForPrint([])).toEqual([[]]);
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

    expect(html).toContain("Quantity");
    expect(html).toContain("Price");
    expect(html).toContain("Line amount");
    expect(html).toContain("Totals Value of Order");
    expect(html).not.toContain(">Shortage<");
    expect(html).not.toContain("Total shortage");
    expect(html).not.toContain("Quantity (W, Retail)");
    expect(html).not.toContain("Price (W, R)");
    expect(html).toContain("KAMANDE");
    expect(html).toContain("10 Bag, 30 kg");
    expect(html).toContain("(12 kg, 10 kg, 8 kg)");
    expect(html).toContain("2,250 per bag, 48 per kg");
    expect(html).toContain('<div class="main">KAMANDE</div>');
    expect(html).toContain('class="pick-line"');
    expect(html).toContain('class="print-page"');
  });

  it("splits long lists across multiple print pages of 24 lines", () => {
    const lines = Array.from({ length: 30 }, (_, i) => ({
      product_name: `ITEM ${i + 1}`,
      quantity_label: "1 Bag",
      wholesale_unit_prices: [100],
      wholesale_pack_label: "Bag",
      line_total: 100,
    }));
    const html = buildPickingListHtml({
      pickingList: {
        layout: "sales",
        list_number: "PK-LONG",
        lines,
      },
      layout: "sales",
    });

    expect(html.match(/class="print-page"/g)?.length).toBe(2);
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("continued · Page 2 of 2");
    expect(html).toContain("ITEM 1");
    expect(html).toContain("ITEM 30");
  });

  it("formats wholesale and retail prices from structured line fields", () => {
    const html = buildPickingListHtml({
      pickingList: {
        layout: "sales",
        list_number: "PK-PRICE",
        lines: [
          {
            product_name: "BEANS",
            quantity_label: "10 Bag, 40 kg",
            wholesale_unit_prices: [2250],
            retail_unit_prices: [52],
            wholesale_pack_label: "Bag",
            retail_pack_label: "kg",
            line_total: 1000,
          },
        ],
      },
      layout: "sales",
    });

    expect(html).toContain("2,250 per bag, 52 per kg");
    expect(html).not.toContain("Ksh");
    expect(html).not.toContain(" · ");
  });

  it("cleans legacy W/R labels from older API payloads", () => {
    const html = buildPickingListHtml({
      pickingList: {
        layout: "sales",
        list_number: "PK-LEGACY",
        lines: [
          {
            product_name: "BEANS",
            quantity_label: "W 3 Bag, R 45 kg",
            retail_breakdown: "Blessed 45 kg, Customer B 10 kg",
            price_label: "W Ksh 2,000 / Bag · R Ksh 50 / kg",
            line_total: 1000,
          },
        ],
      },
      layout: "sales",
    });

    expect(html).toContain("3 Bag, 45 kg");
    expect(html).toContain("(45 kg, 10 kg)");
    expect(html).toContain("2,000 per bag, 50 per kg");
    expect(html).not.toContain("Ksh");
    expect(html).not.toContain("Blessed");
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

  it("defaults to A4 and paginates with print-page sheets", () => {
    const sample = samplePickingListPreviewData({ salesLayout: true });
    const html = buildPickingListHtml({
      pickingList: sample.pickingList,
      trip: sample.trip,
      layout: "sales",
    });

    expect(html).toMatch(/@page\s*\{\s*size:\s*A4/);
    expect(html).toContain('class="print-page"');
    expect(html).toContain('class="pick-line-wrap"');
    expect(html).toContain('class="pick-line"');
    expect(html).toMatch(/\.pick-line-wrap\s*\{[^}]*page-break-inside:\s*avoid/);
    expect(html).toMatch(/page-break-after:\s*always/);
    expect(html).toMatch(/display:\s*grid/);
    expect(html).toContain('class="has-doc-print-edge-footer"');
  });

  it("titles combined lists with natural-language route names", () => {
    const html = buildPickingListHtml({
      pickingList: {
        layout: "sales",
        combined: true,
        list_number: "PK-COMB",
        list_date: "2026-08-06",
        route_names: ["Route A", "Route B"],
        route_names_phrase: "Route A and Route B",
        order_total_value: 1000,
        lines: [
          {
            product_name: "SUGAR",
            quantity_label: "2 Bag",
            line_total: 1000,
            wholesale_unit_prices: [500],
            wholesale_pack_label: "Bag",
          },
        ],
      },
      layout: "sales",
      includeShelfLocation: false,
    });

    expect(html).toContain("Picking List for Route A and Route B");
    expect(html).not.toContain(">Route: ");
    expect(html).toContain("Totals Value of Order");
  });
});
