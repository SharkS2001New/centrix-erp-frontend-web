import { describe, expect, it } from "vitest";
import { formatReportCell, formatReportKes } from "@/lib/reports/format";

describe("formatReportCell identifiers", () => {
  it("does not format sale IDs or order numbers as amounts", () => {
    expect(formatReportCell("sale_id", 50)).toBe("50");
    expect(formatReportCell("order_num", 9_000_032)).toBe("9000032");
  });

  it("preserves identifier strings and continues formatting monetary columns", () => {
    expect(formatReportCell("invoice_number", "000123")).toBe("000123");
    expect(formatReportCell("order_total", 432_000)).toBe(formatReportKes(432_000));
  });
});
