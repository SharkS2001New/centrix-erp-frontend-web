import { describe, expect, it } from "vitest";
import {
  buildTripChartCustomerRows,
  buildTripChartListHtml,
  chunkTripChartRowsForPrint,
  TRIP_CHART_PAGE_BUDGET_MM,
} from "./trip-chart-list-print";

describe("chunkTripChartRowsForPrint", () => {
  it("keeps every stop across pages — no clipped middle row like #36", () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({
      line_no: i + 1,
      customer_name: `Customer ${i + 1}`,
      order_total: 1000 + i,
      order_count: 1,
      stop: i + 1,
    }));
    const chunks = chunkTripChartRowsForPrint(rows);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat().map((r) => r.line_no)).toEqual(
      Array.from({ length: 45 }, (_, i) => i + 1),
    );
    // Non-final pages must not be a single clipped leftover row.
    for (let i = 0; i < chunks.length - 1; i += 1) {
      expect(chunks[i].length).toBeGreaterThan(1);
    }
  });

  it("does not stop packing early for summary until remaining rows fit", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      line_no: i + 1,
      customer_name: `C${i + 1}`,
      order_total: 500,
    }));
    const chunks = chunkTripChartRowsForPrint(rows, {
      firstBudgetMm: 100,
      continuedBudgetMm: 100,
      summaryReserveMm: 40,
      bottomSafetyMm: 0,
    });
    expect(chunks[0].length).toBeGreaterThanOrEqual(8);
    expect(chunks.flat()).toHaveLength(40);
  });

  it("returns one empty chunk when there are no rows", () => {
    expect(chunkTripChartRowsForPrint([])).toEqual([[]]);
  });
});

describe("buildTripChartListHtml pagination", () => {
  it("emits every stop number across print-page sheets", () => {
    const sales = Array.from({ length: 45 }, (_, i) => ({
      customer_num: 1000 + i,
      customer_name: i === 35 ? "Missing Thirty Six" : `Customer ${i + 1}`,
      order_total: 10000 + i,
      pivot: { stop_seq: i + 1 },
    }));
    const html = buildTripChartListHtml({
      trip: {
        trip_code: "TC-17",
        scheduled_date: "2026-09-11",
        route_names: ["ROUTE A"],
        sales,
      },
      printSettings: { show_load_tonnage: false },
    });

    expect(html.match(/class="print-page"/g)?.length ?? 0).toBeGreaterThan(1);
    expect(html).toContain("Page 1 of");
    expect(html).toContain("continued · Page");
    expect(html).toContain('class="stop-line-wrap"');
    expect(html).toContain('class="stop-line"');
    expect(html).toContain('class="print-page"');
    expect(html).toMatch(/display:\s*grid/);
    expect(html).toMatch(/\.stop-line-wrap\s*\{[^}]*page-break-inside:\s*avoid/);
    expect(html).not.toContain("<tbody");
    expect(html).not.toContain("</tr>");
    expect(html).toContain("Missing Thirty Six");
    expect(html).not.toMatch(/class="print-footer-page-counter"/);
    for (let n = 1; n <= 45; n += 1) {
      expect(html).toContain(`>${n}</div>`);
    }
  });

  it("fits a short trip on one page", () => {
    const html = buildTripChartListHtml({
      trip: {
        trip_code: "TC-SHORT",
        sales: [
          {
            customer_num: 1,
            customer_name: "One Stop",
            order_total: 5000,
            pivot: { stop_seq: 1 },
          },
        ],
      },
      printSettings: { show_load_tonnage: false },
    });
    expect(html.match(/class="print-page"/g)?.length ?? 0).toBe(1);
    expect(html).not.toContain("Page 1 of 2");
    expect(html).toContain("Page 1 of 1");
  });
});

describe("buildTripChartCustomerRows", () => {
  it("numbers customers in stop order", () => {
    const rows = buildTripChartCustomerRows({
      sales: [
        {
          customer_num: 2,
          customer_name: "B",
          order_total: 200,
          pivot: { stop_seq: 2 },
        },
        {
          customer_num: 1,
          customer_name: "A",
          order_total: 100,
          pivot: { stop_seq: 1 },
        },
      ],
    });
    expect(rows.map((r) => r.line_no)).toEqual([1, 2]);
    expect(rows.map((r) => r.customer_name)).toEqual(["A", "B"]);
  });
});

describe("TRIP_CHART_PAGE_BUDGET_MM", () => {
  it("keeps first-page budget below A4 usable height", () => {
    expect(TRIP_CHART_PAGE_BUDGET_MM.first).toBeLessThan(250);
    expect(TRIP_CHART_PAGE_BUDGET_MM.continued).toBeGreaterThan(
      TRIP_CHART_PAGE_BUDGET_MM.first,
    );
  });
});
