import { describe, expect, it } from "vitest";
import {
  buildPickingListHtml,
  chunkPickingLinesForPrint,
  estimatePickingLineHeightMm,
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
  it("packs by estimated height so short rows fill the page denser than tall ones", () => {
    const shortLines = Array.from({ length: 50 }, (_, i) => ({
      line_no: i + 1,
      product_name: `ITEM ${i + 1}`,
      quantity_label: "1 Bag",
    }));
    const shortChunks = chunkPickingLinesForPrint(shortLines);
    expect(shortChunks[0].length).toBeGreaterThan(12);
    expect(shortChunks[0].length).toBeLessThanOrEqual(PICKING_LIST_LINES_PER_PAGE);
    // A 1-line middle sheet is the overflow bug: last row of page 1 spills, then
    // page-break-after:always leaves the rest of that leaf blank.
    for (let i = 0; i < shortChunks.length - 1; i += 1) {
      expect(shortChunks[i].length).toBeGreaterThan(1);
    }
    expect(shortChunks.flat()).toHaveLength(shortLines.length);

    const tallLines = Array.from({ length: 40 }, (_, i) => ({
      line_no: i + 1,
      product_name: `VERY LONG PRODUCT NAME THAT WRAPS ON THE SHEET ${i + 1}`,
      quantity_label: "10 Bag, 30 kg, 12 kg extras",
      retail_breakdown: "20 kg, 20 kg, 10 kg, 10 kg",
      price_label: "2,250 per bag, 48 per kg, 12 per piece",
    }));
    const tallChunks = chunkPickingLinesForPrint(tallLines);
    expect(tallChunks[0].length).toBeGreaterThan(0);
    expect(tallChunks[0].length).toBeLessThan(shortChunks[0].length);
    expect(tallChunks.flat()).toHaveLength(tallLines.length);
  });

  it("does not drop line numbers across page breaks when qty wraps tall", () => {
    // Reproduces clipped #34: under-estimated multi-line qty packed past A4, Chromium
    // clipped the last wrap then page 2 started at the next index.
    const lines = Array.from({ length: 40 }, (_, i) => {
      const tall = i === 13 || i === 30;
      return {
        line_no: i + 1,
        product_name: tall ? "KAMANDE LARGE 50KG" : `ITEM ${i + 1}`,
        quantity_label: tall ? "15 bag, 400 kg" : "6 bale",
        retail_breakdown: tall
          ? "50 kg, 30 kg, 25 kg, 25 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg, 20 kg"
          : "",
        price_label: tall
          ? "6,715 per bag, 135, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152 per kg"
          : "1,935 per bale",
        line_total: tall ? 155555 : 11610,
      };
    });
    const chunks = chunkPickingLinesForPrint(lines);
    const nos = chunks.flat().map((line) => line.line_no);
    expect(nos).toEqual(lines.map((line) => line.line_no));
    expect(estimatePickingLineHeightMm(lines[13])).toBeGreaterThan(14);
    for (let i = 0; i < chunks.length - 1; i += 1) {
      expect(chunks[i].length).toBeGreaterThan(1);
    }
  });

  it("returns one empty chunk when there are no lines", () => {
    expect(chunkPickingLinesForPrint([])).toEqual([[]]);
  });

  it("breaks before an item that would not fit the remaining page budget", () => {
    const lines = [
      ...Array.from({ length: 5 }, (_, i) => ({
        product_name: `A${i}`,
        quantity_label: "1 Bag",
      })),
      {
        product_name: "TALL",
        quantity_label: "10 Bag, 30 kg",
        retail_breakdown: "20 kg, 20 kg, 10 kg, 10 kg",
        price_label: "2,250 per bag, 48 per kg",
      },
    ];
    const chunks = chunkPickingLinesForPrint(lines, {
      firstBudgetMm: 40,
      continuedBudgetMm: 40,
      summaryReserveMm: 10,
      bottomSafetyMm: 5,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toHaveLength(lines.length);
  });

  it("does not apply summary reserve until remaining lines fit with used height", () => {
    // Reproduces the blank-page bug: remaining-from-here looked small enough for
    // summary reserve, but used height was already past the reduced budget.
    const lines = Array.from({ length: 20 }, (_, i) => ({
      product_name: `ITEM ${i + 1}`,
      quantity_label: "1 Bag",
    }));
    const chunks = chunkPickingLinesForPrint(lines, {
      firstBudgetMm: 100,
      continuedBudgetMm: 100,
      summaryReserveMm: 40,
      bottomSafetyMm: 0,
    });
    // Short rows are ~6.0mm → 100mm budget holds ~16 lines, not stop early for summary.
    expect(chunks[0].length).toBeGreaterThanOrEqual(11);
    expect(chunks.flat()).toHaveLength(lines.length);
  });

  it("packs more than 32 short sales lines onto the first A4 page", () => {
    const lines = Array.from({ length: 54 }, (_, i) => ({
      line_no: i + 1,
      product_name: `ITEM ${i + 1}`,
      quantity_label: "10 kg",
      price_label: "100 per kg",
    }));
    const chunks = chunkPickingLinesForPrint(lines);
    // Warehouse sheets were stopping ~28 with a large blank third of the page.
    expect(chunks[0].length).toBeGreaterThan(32);
    expect(chunks.flat()).toHaveLength(54);
  });

  it("packs more than 26 short sales lines onto the first A4 page", () => {
    const lines = Array.from({ length: 36 }, (_, i) => ({
      line_no: i + 1,
      product_name: `ITEM ${i + 1}`,
      quantity_label: "10 kg",
      price_label: "100 per kg",
    }));
    const chunks = chunkPickingLinesForPrint(lines);
    expect(chunks[0].length).toBeGreaterThan(26);
    expect(chunks.flat()).toHaveLength(36);
  });

  it("fits a typical 20-line sales picking list on one A4 page", () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({
      line_no: i + 1,
      product_name: i === 13 ? "KAMANDE LARGE 50KG" : `ITEM ${i + 1}`,
      quantity_label: i === 13 ? "2 bag, 128 kg" : "10 kg",
      price_label: i === 13 ? "6,715 per bag, 135, 141 per kg" : "100 per kg",
    }));
    const chunks = chunkPickingLinesForPrint(lines);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(20);

    const html = buildPickingListHtml({
      pickingList: {
        layout: "sales",
        list_number: "PK-20260910-121",
        lines,
      },
      layout: "sales",
    });
    expect(html.match(/class="print-page"/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("Page 1 of 2");
  });

  it("keeps every line across pages for a long sales picking list", () => {
    const lines = Array.from({ length: 48 }, (_, i) => ({
      line_no: i + 1,
      product_name: i === 21 ? "ANAB PK 386" : `ITEM ${i + 1}`,
      quantity_label: i === 21 ? "5 bags" : "1 Bag",
      price_label: i === 21 ? "3,745 per bags" : "100 per bag",
      line_total: i === 21 ? 18725 : 100,
    }));
    const chunks = chunkPickingLinesForPrint(lines);
    expect(chunks.flat()).toHaveLength(48);
    expect(chunks.flat().map((l) => l.line_no)).toEqual(
      Array.from({ length: 48 }, (_, i) => i + 1),
    );
    expect(chunks.some((chunk) => chunk.some((l) => l.product_name === "ANAB PK 386"))).toBe(
      true,
    );
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
    expect(html).not.toContain('col-weight">Weight');
    expect(html).toContain("Picking list tonnage");
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

  it("splits long lists across multiple print pages by height, not a fixed 24", () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({
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

    const pageCount = html.match(/class="print-page"/g)?.length ?? 0;
    expect(pageCount).toBeGreaterThan(1);
    expect(html).toContain("Page 1 of");
    expect(html).toContain("continued · Page");
    expect(html).not.toMatch(/class="print-footer-page-counter"/);
    expect(html).toContain("ITEM 1");
    expect(html).toContain("ITEM 70");
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
    // Sheet must be 100% of padded body — fixed 210mm + 12mm sides clipped Line amount.
    expect(html).toMatch(/\.print-page\s*\{[^}]*width:\s*100%/);
    expect(html).not.toMatch(/\.print-page\s*\{[^}]*width:\s*210mm/);
    expect(html).toMatch(/\.col-total\s*\{[^}]*white-space:\s*nowrap/);
    expect(html).toContain("minmax(22mm, 1fr)");
  });

  it("keeps large line amounts in the HTML for every row", () => {
    const lines = Array.from({ length: 28 }, (_, i) => ({
      product_name: i === 21 ? "ANAB PK 386" : `ITEM ${i + 1}`,
      quantity_label: i === 21 ? "5 bags" : "6 bale",
      wholesale_unit_prices: [i === 21 ? 3745 : 1935],
      wholesale_pack_label: i === 21 ? "bags" : "bale",
      line_total: i === 21 ? 18725 : 11610,
    }));
    const html = buildPickingListHtml({
      pickingList: {
        layout: "sales",
        list_number: "PK-CLIP",
        lines,
      },
      layout: "sales",
    });

    expect(html).toContain("ANAB PK 386");
    expect(html).toContain("18,725.00");
    expect(html).toContain("11,610.00");
    expect(html).toContain("ITEM 1");
    expect(html).toContain("ITEM 28");
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
