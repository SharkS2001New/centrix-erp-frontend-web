import { describe, expect, it } from "vitest";
import {
  aggregateChartSeries,
  formatChartLabel,
} from "@/components/reports/report-charts";

describe("report chart aggregation", () => {
  it("formats date labels in auto mode", () => {
    expect(formatChartLabel("2026-08-01", "auto")).toMatch(/Aug|01|2026/);
  });

  it("keeps categorical labels intact", () => {
    expect(formatChartLabel("Jane Cashier", "category")).toBe("Jane Cashier");
  });

  it("ranks and limits series for comparison charts", () => {
    const rows = [
      { salesperson: "Ann", gross_sales: 100 },
      { salesperson: "Bob", gross_sales: 400 },
      { salesperson: "Ann", gross_sales: 50 },
      { salesperson: "Cara", gross_sales: 200 },
    ];
    const series = aggregateChartSeries(rows, "salesperson", "gross_sales", {
      labelMode: "category",
      limit: 2,
    });
    expect(series).toEqual([
      { label: "Bob", value: 400 },
      { label: "Cara", value: 200 },
    ]);
  });
});
