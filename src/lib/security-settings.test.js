import { describe, expect, it } from "vitest";
import {
  nightSessionIdleMinutesForNow,
  resolveSecurityTimeouts,
} from "./security-settings";

describe("resolveSecurityTimeouts", () => {
  it("prefers top-level capabilities values when present", () => {
    expect(
      resolveSecurityTimeouts({
        screen_lock_minutes: 45,
        session_idle_minutes: 120,
        module_settings: {
          security: {
            screen_lock_minutes: 5,
            session_idle_minutes: 60,
          },
        },
      }),
    ).toEqual({
      screen_lock_minutes: 45,
      session_idle_minutes: 120,
    });

  });

  it("falls back to module_settings.security when top-level screen lock is missing", () => {
    expect(
      resolveSecurityTimeouts({
        session_idle_minutes: 120,
        module_settings: {
          security: {
            screen_lock_minutes: 45,
            session_idle_minutes: 90,
          },
        },
      }),
    ).toEqual({
      screen_lock_minutes: 45,
      session_idle_minutes: 120,
    });
  });

  describe("nightSessionIdleMinutesForNow", () => {
    const capabilities = {
      night_session: {
        enabled: true,
        start: "23:00",
        end: "06:00",
        idle_minutes: 30,
        timezone: "Africa/Nairobi",
      },
    };

    it("uses the overnight idle limit across midnight", () => {
      expect(nightSessionIdleMinutesForNow(capabilities, new Date("2026-11-03T20:30:00Z"))).toBe(30);
      expect(nightSessionIdleMinutesForNow(capabilities, new Date("2026-11-03T02:00:00Z"))).toBe(30);
    });

    it("does not apply the overnight limit during the day", () => {
      expect(nightSessionIdleMinutesForNow(capabilities, new Date("2026-11-03T08:00:00Z"))).toBeNull();
    });
  });

  it("uses defaults when capabilities are empty", () => {
    expect(resolveSecurityTimeouts(null)).toEqual({
      screen_lock_minutes: 5,
      session_idle_minutes: 60,
    });
  });
});
