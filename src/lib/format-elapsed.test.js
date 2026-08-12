import { describe, expect, it } from "vitest";
import { formatElapsedDuration } from "@/lib/format-elapsed";

describe("formatElapsedDuration", () => {
  it("formats sub-minute durations", () => {
    expect(formatElapsedDuration(5_000)).toBe("5s");
    expect(formatElapsedDuration(59_000)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsedDuration(65_000)).toBe("1m 05s");
    expect(formatElapsedDuration(12 * 60_000 + 5_000)).toBe("12m 05s");
  });

  it("formats hours without seconds", () => {
    expect(formatElapsedDuration(3_723_000)).toBe("1h 02m");
  });
});
