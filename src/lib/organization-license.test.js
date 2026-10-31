import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  isLicenseExpired,
  isLicenseExpiringSoon,
  isFreePlanPath,
  isLimitedLicencePath,
  isYearlyLicence,
  subscriptionRenewalOpen,
  yearlyRenewalOpen,
  freePlanHome,
  licencePlanPath,
  licenseAccessMode,
  licenceNeedsPayment,
  usesPackageOne,
  externalPosRequiresDatedSubscription,
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

  it("opens renewal during the final 30 days for a paid monthly subscription", () => {
    const expires = new Date(Date.now() + 25 * 86400000).toISOString();
    const license = resolveOrganizationLicense({
      status: "active",
      plan_id: 42,
      renewal_amount: 1500,
      billing_cycle: "monthly",
      current_period_end: expires,
    });
    expect(subscriptionRenewalOpen(license)).toBe(true);

    const notDue = resolveOrganizationLicense({
      status: "active",
      plan_id: 42,
      renewal_amount: 1500,
      current_period_end: new Date(Date.now() + 31 * 86400000).toISOString(),
    });
    expect(subscriptionRenewalOpen(notDue)).toBe(false);
  });

  it("does not offer paid renewal for a trial", () => {
    const trial = resolveOrganizationLicense({
      status: "trialing",
      is_trial: true,
      plan_id: 42,
      renewal_amount: 1500,
      current_period_end: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
    expect(subscriptionRenewalOpen(trial)).toBe(false);
  });

  it("closes at the saved hour and stays open before that hour", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const closed = resolveOrganizationLicense({ status: "active", expires_at: past });
    const open = resolveOrganizationLicense({ status: "active", expires_at: future });
    expect(isLicenseExpired(closed)).toBe(true);
    expect(licenceNeedsPayment(closed)).toBe(true);
    expect(isLicenseExpired(open)).toBe(false);
    expect(licenceNeedsPayment(open)).toBe(false);
  });

  it("stays closed until the start hour", () => {
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const license = resolveOrganizationLicense({
      status: "active",
      starts_at: start,
      expires_at: end,
    });
    expect(license?.status).toBe("scheduled");
    expect(licenceNeedsPayment(license)).toBe(true);
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

  it("keeps free and expired users on the allowed pages", () => {
    expect(licenseAccessMode({ access: "free" })).toBe("free");
    expect(licenceNeedsPayment({ access: "expired" })).toBe(true);
    expect(licenceNeedsPayment({ access: "full" })).toBe(false);
    expect(licenceNeedsPayment({ access: "trial" })).toBe(false);
    expect(usesPackageOne({ access: "trial" })).toBe(false);
    expect(usesPackageOne({ access: "free" })).toBe(true);
    expect(usesPackageOne({ access: "expired" })).toBe(true);
    expect(usesPackageOne({ access: "full" })).toBe(false);
    expect(licenseAccessMode({ status: "trialing", is_trial: true, days_remaining: 5 })).toBe("trial");
    const withModules = resolveOrganizationLicense({
      status: "trialing",
      is_trial: true,
      expires_at: "2099-01-01",
      access: "trial",
      modules: ["backoffice", "hr"],
    });
    expect(withModules?.modules).toEqual(["backoffice", "hr"]);
    expect(licenceNeedsPayment(withModules)).toBe(false);
    expect(usesPackageOne(withModules)).toBe(false);
    expect(isLimitedLicencePath("/products")).toBe(true);
    expect(isLimitedLicencePath("/customers/4")).toBe(true);
    expect(isLimitedLicencePath("/suppliers")).toBe(true);
    expect(isLimitedLicencePath("/suppliers/invoices")).toBe(false);
    expect(isLimitedLicencePath("/reports/daily-sales")).toBe(true);
    expect(isLimitedLicencePath("/reports/profit-loss")).toBe(false);
    expect(isLimitedLicencePath("/sales/pos")).toBe(false);
    expect(isLimitedLicencePath("/subscribe")).toBe(true);
    expect(isLimitedLicencePath("/billing")).toBe(true);
    expect(licencePlanPath("/pos")).toBe("/subscribe");
    expect(licencePlanPath("/hotel-bar-pos")).toBe("/subscribe");
    expect(licencePlanPath("/accounting")).toBe("/subscribe");
    expect(licencePlanPath("/hr")).toBe("/subscribe");
    expect(licencePlanPath("/fulfillment")).toBe("/subscribe");
    expect(licencePlanPath("/products")).toBe("/subscribe");
  });

  it("keeps paybill instructions from the licence payload", () => {
    const license = resolveOrganizationLicense({
      status: "active",
      expires_at: "2099-01-01",
      paybill: { short_code: "4036507", account_number: "MOON" },
    });
    expect(license?.paybill?.short_code).toBe("4036507");
    const withPlans = resolveOrganizationLicense({
      status: "trialing",
      access: "trial",
      plans: [{ id: 1, name: "Sales", monthly_price: 2000 }],
      duration_discount: { percent: 10, min_months: 3 },
    });
    expect(withPlans?.plans).toEqual([{ id: 1, name: "Sales", monthly_price: 2000 }]);
    expect(withPlans?.duration_discount?.percent).toBe(10);
    expect(license?.paybill?.account_number).toBe("MOON");
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

  it("keeps Package 1 on the dashboard until more screens are allowed", () => {
    const free = resolveOrganizationLicense({
      status: "missing",
      access: "free",
      free_plan: { rules: [{ path: "/dashboard", exact: true }] },
    });
    expect(free.free_plan.rules).toHaveLength(1);
    expect(isFreePlanPath("/dashboard", free)).toBe(true);
    expect(isFreePlanPath("/products", free)).toBe(false);
    expect(isFreePlanPath("/subscribe", free)).toBe(true);
    expect(freePlanHome(free)).toBe("/dashboard");
    expect(isLimitedLicencePath("/products")).toBe(true);
  });

  it("switches an ended trial onto Package 1 so they can pay", () => {
    const ended = resolveOrganizationLicense({
      status: "expired",
      access: "expired",
      is_trial: false,
      plan_name: "Starter",
      current_package: "Package 1",
      free_plan: { rules: [{ path: "/dashboard", exact: true }] },
    });
    expect(licenseAccessMode(ended)).toBe("expired");
    expect(usesPackageOne(ended)).toBe(true);
    expect(ended.is_trial).toBe(false);
    expect(ended.current_package).toBe("Package 1");
    expect(licenceNeedsPayment(ended)).toBe(true);
    expect(isFreePlanPath("/dashboard", ended)).toBe(true);
  });

  it("hides plan changes for a healthy yearly licence and opens renew while it is counting down", () => {
    const healthy = resolveOrganizationLicense({
      status: "active",
      expires_at: "2099-12-31",
      billing_cycle: "yearly",
      renewal_amount: 51000,
      plan_name: "Yearly",
    });
    expect(isYearlyLicence(healthy)).toBe(true);
    expect(yearlyRenewalOpen(healthy)).toBe(false);

    const soon = resolveOrganizationLicense({
      status: "active",
      expires_at: addCalendarDays(undefined, 3),
      billing_cycle: "yearly",
      renewal_amount: 51000,
    });
    expect(yearlyRenewalOpen(soon)).toBe(true);
    expect(isYearlyLicence(resolveOrganizationLicense({
      status: "trialing",
      is_trial: true,
      expires_at: addCalendarDays(undefined, 3),
      billing_cycle: "yearly",
    }))).toBe(false);
  });

  it("keeps External POS off token billing", () => {
    expect(externalPosRequiresDatedSubscription({ access: "token" })).toBe(true);
    expect(externalPosRequiresDatedSubscription({ access: "full" })).toBe(false);
    expect(externalPosRequiresDatedSubscription({ access: "trial" })).toBe(false);
  });
});
