import { describe, expect, it } from "vitest";
import { resolveSecurityTimeouts } from "./security-settings";

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

  it("uses defaults when capabilities are empty", () => {
    expect(resolveSecurityTimeouts(null)).toEqual({
      screen_lock_minutes: 5,
      session_idle_minutes: 60,
    });
  });
});
