import { describe, expect, it } from "vitest";
import {
  onboardingDemoStorageKey,
  onboardingGuideStorageKey,
  isEligibleForMonthlyCustomerDemo,
  guideDescriptionForNavItem,
  guideCardPosition,
  videoDemoEmbedUrl,
} from "@/lib/onboarding-guide";

describe("onboarding guide", () => {
  it("scopes completion to both user and organization", () => {
    expect(onboardingGuideStorageKey(12, 34)).toBe("centrix_onboarding_v1:user:12:org:34");
    expect(onboardingGuideStorageKey(12, null)).toBeNull();
    expect(onboardingDemoStorageKey(12, 34)).toBe("centrix_demo_v1:user:12:org:34");
    expect(onboardingDemoStorageKey(12, null)).toBeNull();
  });

  it("accepts supported YouTube and Vimeo demo links", () => {
    expect(videoDemoEmbedUrl("https://youtu.be/abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
    );
    expect(videoDemoEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
    );
    expect(videoDemoEmbedUrl("https://vimeo.com/123456")).toBe(
      "https://player.vimeo.com/video/123456",
    );
  });

  it("limits the in-app demo to paid monthly self-registered organizations", () => {
    const monthlyLicense = {
      status: "active",
      is_trial: false,
      billing_cycle: "monthly",
      plan_id: 7,
      renewal_amount: 2500,
    };

    expect(isEligibleForMonthlyCustomerDemo(
      { registration_source: "self_registered" },
      monthlyLicense,
    )).toBe(true);
    expect(isEligibleForMonthlyCustomerDemo(
      { registration_source: "platform_created" },
      monthlyLicense,
    )).toBe(false);
    expect(isEligibleForMonthlyCustomerDemo(
      { registration_source: "self_registered" },
      { ...monthlyLicense, billing_cycle: "yearly" },
    )).toBe(false);
    expect(isEligibleForMonthlyCustomerDemo(
      { registration_source: "self_registered" },
      { ...monthlyLicense, is_trial: true },
    )).toBe(false);
  });

  it("uses link-specific descriptions for usage tips", () => {
    expect(guideDescriptionForNavItem({ label: "Units of Measure" })).toContain("unit conversions");
    expect(guideDescriptionForNavItem({ label: "Retail Packages" })).toContain("pack sizes");
    expect(guideDescriptionForNavItem({ label: "Sales Analytics" })).toContain("sales totals and trends");
    expect(guideDescriptionForNavItem({ label: "Business Summary" })).toContain("key business figures");
    expect(guideDescriptionForNavItem({ label: "Custom Area" })).not.toBe(
      guideDescriptionForNavItem({ label: "Another Area" }),
    );
  });

  it("positions usage tips beside their target links and within the viewport", () => {
    expect(guideCardPosition({ x: 180, y: 200, width: 90, height: 40 }, 1200, 800))
      .toEqual({ left: 284, top: 110, width: 380 });

    const narrowViewport = guideCardPosition({ x: 120, y: 720, width: 100, height: 40 }, 375, 800);
    expect(narrowViewport.left).toBeGreaterThanOrEqual(16);
    expect(narrowViewport.left + narrowViewport.width).toBeLessThanOrEqual(359);
    expect(narrowViewport.top).toBeLessThanOrEqual(564);
  });

  it("rejects malformed, insecure, and unsupported video links", () => {
    expect(videoDemoEmbedUrl("not a url")).toBeNull();
    expect(videoDemoEmbedUrl("http://youtu.be/abcdefghijk")).toBeNull();
    expect(videoDemoEmbedUrl("https://example.com/video")).toBeNull();
    expect(videoDemoEmbedUrl("https://youtube.com/watch?v=short")).toBeNull();
  });
});
