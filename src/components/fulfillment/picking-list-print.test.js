import { describe, expect, it } from "vitest";
import {
  buildPickingListHtml,
  formatRouteNamesPhrase,
  isSalesPickingLayout,
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
    expect(html).toContain('<div class="main">KAMANDE</div>\n        </td>');
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
