import { describe, expect, it } from "vitest";
import {
  clampPosOrderBusinessDate,
  normalizePosOrderDate,
  todayPosOrderDate,
} from "@/lib/pos-offline-db";

describe("normalizePosOrderDate", () => {
  it("keeps plain Y-m-d business dates", () => {
    expect(normalizePosOrderDate("2026-08-03")).toBe("2026-08-03");
  });

  it("uses Africa/Nairobi calendar date for UTC ISO timestamps", () => {
    // 2026-08-03 23:30 UTC = 2026-08-04 02:30 in Nairobi
    expect(normalizePosOrderDate("2026-08-03T23:30:00.000Z")).toBe("2026-08-04");
    // 2026-08-03 10:00 UTC = 2026-08-03 13:00 in Nairobi
    expect(normalizePosOrderDate("2026-08-03T10:00:00.000Z")).toBe("2026-08-03");
  });
});

describe("clampPosOrderBusinessDate", () => {
  it("clamps a future POS date to today in Nairobi", () => {
    const today = todayPosOrderDate();
    expect(clampPosOrderBusinessDate("2099-12-31")).toBe(today);
  });
});
