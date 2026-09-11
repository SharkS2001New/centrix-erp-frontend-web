import { describe, expect, it } from "vitest";
import {
  isSingleDateLeaveDuration,
  leaveDurationLabel,
  leaveHoursAreValid,
  parseLeaveHours,
} from "@/lib/leave-duration";

describe("leave duration", () => {
  it("treats hourly and half day as a single date", () => {
    expect(isSingleDateLeaveDuration("hourly")).toBe(true);
    expect(isSingleDateLeaveDuration("half_day")).toBe(true);
    expect(isSingleDateLeaveDuration("full_day")).toBe(false);
  });

  it("requires at least a quarter hour", () => {
    expect(leaveHoursAreValid("1")).toBe(true);
    expect(leaveHoursAreValid("0.25")).toBe(true);
    expect(leaveHoursAreValid("0")).toBe(false);
    expect(leaveHoursAreValid("")).toBe(false);
  });

  it("labels hourly leave in hours", () => {
    expect(leaveDurationLabel({ duration_type: "hourly", total_hours: 1 })).toBe("1 hour");
    expect(leaveDurationLabel({ duration_type: "hourly", total_hours: 2.5 })).toBe("2.5 hours");
    expect(leaveDurationLabel({ duration_type: "half_day", half_day_period: "morning" })).toBe(
      "Half day (Morning)",
    );
  });

  it("parses typed hours as a number", () => {
    expect(parseLeaveHours("1.25")).toBe(1.25);
    expect(parseLeaveHours("2")).toBe(2);
  });
});
