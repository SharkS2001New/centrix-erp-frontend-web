import { describe, expect, it } from "vitest";
import { formatThermalReceiptDateTime, normalizeDateInput, resolveSaleReceiptTimestamp } from "@/lib/datetime";

describe("resolveSaleReceiptTimestamp", () => {
  it("prefers created_at_ms for offline sales", () => {
    expect(
      resolveSaleReceiptTimestamp({
        created_at_ms: Date.parse("2026-08-03T10:00:00.000Z"),
        completed_at: "2026-08-04T10:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-08-03T10:00:00.000Z"));
  });
});

describe("formatThermalReceiptDateTime", () => {
  it("formats UTC timestamps in Africa/Nairobi", () => {
    const formatted = formatThermalReceiptDateTime("2026-07-29T13:00:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/04:00 pm/i);
  });

  it("treats timezone-less datetimes as East Africa Time", () => {
    const formatted = formatThermalReceiptDateTime("2026-07-29T16:00:00");
    expect(formatted).toMatch(/04:00 pm/i);
  });

  it("normalizes API datetime strings with a space separator", () => {
    const date = normalizeDateInput("2026-07-29 16:00:00");
    expect(date).not.toBeNull();
    expect(formatThermalReceiptDateTime("2026-07-29 16:00:00")).toMatch(/04:00 pm/i);
  });
});
