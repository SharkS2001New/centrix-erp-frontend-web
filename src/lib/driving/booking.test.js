import { describe, expect, it } from "vitest";
import { bookingPresetFromSearch, buildBookingHref } from "@/lib/driving/booking";

describe("driving booking links", () => {
  it("builds a prefilled booking link for a day and hour", () => {
    const href = buildBookingHref({ dateIso: "2026-11-24", hour: 8, instructorId: 7, vehicleId: 3, branchId: 2 });
    expect(href).toBe("/driving-school/schedule/new?date=2026-11-24&time=08%3A00&instructor=7&vehicle=3&branch=2");
  });

  it("omits optional ids and defaults the time", () => {
    const href = buildBookingHref({ dateIso: "2026-11-24" });
    expect(href).toBe("/driving-school/schedule/new?date=2026-11-24&time=09%3A00");
    expect(buildBookingHref().startsWith("/driving-school/schedule/new?time=")).toBe(true);
  });

  it("parses presets back from the search string", () => {
    const preset = bookingPresetFromSearch("?date=2026-11-24&time=10%3A30&instructor=7&vehicle=3&branch=2");
    expect(preset).toEqual({
      date: "2026-11-24",
      starts_at: "2026-11-24T10:30",
      instructor_id: "7",
      vehicle_id: "3",
      branch_id: "2",
    });
  });

  it("ignores malformed dates and falls back to 09:00", () => {
    expect(bookingPresetFromSearch("?date=not-a-date&time=10:30").starts_at).toBe("");
    const preset = bookingPresetFromSearch("?date=2026-11-24&time=late");
    expect(preset.starts_at).toBe("2026-11-24T09:00");
    expect(bookingPresetFromSearch("").starts_at).toBe("");
  });
});
