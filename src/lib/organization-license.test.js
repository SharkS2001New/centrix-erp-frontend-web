import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isLicenseExpired,
  isLicenseExpiringSoon,
  resolveOrganizationLicense,
  canExtendPlatformLicence,
  canStartPlatformTrial,
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

  it("treats missing subscription as locked", () => {
    const license = resolveOrganizationLicense({
      status: "missing",
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

  it("shows extend for trial or expiring soon, not for healthy yearly licences", () => {
    const yearly = resolveOrganizationLicense({
      status: "active",
      current_period_end: "2099-12-31",
    });
    const yearlySub = { status: "active", current_period_end: "2099-12-31" };
    expect(canExtendPlatformLicence(yearlySub, yearly, { soon: false })).toBe(false);
    expect(canStartPlatformTrial(yearlySub, yearly, { expired: false })).toBe(false);

    const trialing = resolveOrganizationLicense({
      status: "trialing",
      current_period_end: "2026-08-14",
      is_trial: true,
    });
    const trialSub = { status: "trialing", current_period_end: "2026-08-14" };
    expect(canExtendPlatformLicence(trialSub, trialing, { soon: true })).toBe(true);
    expect(canStartPlatformTrial(trialSub, trialing, { expired: false })).toBe(false);

    const soon = resolveOrganizationLicense({
      status: "active",
      current_period_end: addCalendarDays(undefined, 5),
    });
    const soonSub = { status: "active", current_period_end: soon.expires_at };
    expect(canExtendPlatformLicence(soonSub, soon, { soon: true })).toBe(true);
    expect(canStartPlatformTrial(soonSub, soon, { expired: false })).toBe(false);
  });

  it("offers trial only for expired or cancelled subscriptions", () => {
    const expiredLicense = resolveOrganizationLicense({
      status: "expired",
      current_period_end: "2020-01-01",
    });
    const expiredSub = { status: "expired", current_period_end: "2020-01-01" };
    expect(canStartPlatformTrial(expiredSub, expiredLicense, { expired: true })).toBe(true);

    const cancelledSub = { status: "cancelled", current_period_end: "2026-01-01" };
    expect(canStartPlatformTrial(cancelledSub, expiredLicense, { expired: false })).toBe(true);
  });
});
