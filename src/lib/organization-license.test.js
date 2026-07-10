import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isLicenseExpired,
  isLicenseExpiringSoon,
  resolveOrganizationLicense,
} from "@/lib/organization-license";

describe("organization license", () => {
  it("treats far-future active licence as not expiring soon", () => {
    const license = resolveOrganizationLicense({
      status: "active",
      current_period_end: "2099-12-31",
    });
    expect(isLicenseExpired(license)).toBe(false);
    expect(isLicenseExpiringSoon(license)).toBe(false);
  });

  it("warns within 7 days of expiry", () => {
    const expires = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const license = resolveOrganizationLicense({
      status: "active",
      expires_at: expires,
    });
    expect(isLicenseExpired(license)).toBe(false);
    expect(isLicenseExpiringSoon(license)).toBe(true);
  });

  it("marks past period end as expired even if status is still active", () => {
    const license = resolveOrganizationLicense({
      status: "active",
      current_period_end: "2020-01-01",
    });
    expect(isLicenseExpired(license)).toBe(true);
  });

  it("reads nested license / trial payload", () => {
    const license = resolveOrganizationLicense({
      license: { status: "trialing", trial_ends_at: "2099-01-01", is_trial: true },
    });
    expect(license?.is_trial).toBe(true);
    expect(license?.status).toBe("trialing");
  });

  it("adds calendar days for extend / trial", () => {
    expect(addCalendarDays("2026-01-01", 14)).toBe("2026-01-15");
  });
});
