import { describe, expect, it } from "vitest";
import {
  aiFormFromApi,
  aiPayloadFromForm,
  canUseAiTalk,
  insightsFormFromApi,
  insightsPayloadFromForm,
  textToList,
} from "@/lib/ai-settings";
import { canUseAiInsights, formatInsightClipboard } from "@/lib/ai-insights";

describe("ai insights settings helpers", () => {
  it("maps insights defaults from empty api payload", () => {
    const form = aiFormFromApi({});
    expect(form.insights.enabled).toBe(true);
    expect(form.insights.channels.email).toBe(true);
    expect(form.insights.stock_pulse.schedule_time).toBe("07:00");
  });

  it("round-trips recipient lists", () => {
    const form = insightsFormFromApi({
      enabled: true,
      recipients: { emails: ["a@x.com", "b@y.com"], phones: ["+254700"], whatsapp_phones: [] },
      channels: { email: true, whatsapp: true, sms: false },
      stock_pulse: { enabled: true, schedule_time: "08:30", lookback_days: 10 },
      sales_brief: { enabled: false, schedule_time: "07:00", lookback_days: 7 },
      exception_alerts: { enabled: true, low_stock: true, unpaid_spike: true },
    });
    const payload = insightsPayloadFromForm(form);
    expect(payload.recipients.emails).toEqual(["a@x.com", "b@y.com"]);
    expect(payload.recipients.phones).toEqual(["+254700"]);
    expect(payload.channels.whatsapp).toBe(true);
    expect(payload.stock_pulse.enabled).toBe(true);
    expect(payload.stock_pulse.schedule_time).toBe("08:30");
    expect(payload.exception_alerts.unpaid_spike).toBe(true);
  });

  it("includes insights in org payload and can omit for platform", () => {
    const form = aiFormFromApi({
      settings: { enabled: true, insights: { enabled: false } },
      available: true,
    });
    expect(aiPayloadFromForm(form).insights.enabled).toBe(false);
    expect(aiPayloadFromForm(form, { includeInsights: false }).insights).toBeUndefined();
  });

  it("round-trips platform talk_enabled in credentials payload", () => {
    const form = aiFormFromApi({
      settings: { enabled: true, talk_enabled: false },
    });
    expect(form.talk_enabled).toBe(false);
    expect(
      aiPayloadFromForm(form, { includeInsights: false, includePlatformGemini: true }).talk_enabled,
    ).toBe(false);
    expect(aiPayloadFromForm(form, { includeInsights: false }).talk_enabled).toBeUndefined();
  });

  it("gates Talk on platform talk_enabled", () => {
    const allow = () => true;
    const base = {
      platform_ai_enabled: true,
      ai_assistant: { available: true, enabled: true },
    };
    expect(canUseAiTalk({ capabilities: base, hasPermission: allow })).toBe(true);
    expect(
      canUseAiTalk({
        capabilities: { ...base, ai_assistant: { ...base.ai_assistant, talk_enabled: false } },
        hasPermission: allow,
      }),
    ).toBe(false);
  });

  it("parses comma and semicolon recipient text", () => {
    expect(textToList("a@x.com, b@y.com; c@z.com")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
  });
});

describe("canUseAiInsights", () => {
  const allow = () => true;
  const deny = () => false;

  it("requires permission, enabled org AI, and available key", () => {
    expect(canUseAiInsights({ capabilities: {}, hasPermission: deny })).toBe(false);
    expect(
      canUseAiInsights({
        capabilities: {
          platform_ai_enabled: true,
          ai_assistant: { available: true, enabled: true, insights: { enabled: true } },
        },
        hasPermission: allow,
      }),
    ).toBe(true);
    expect(
      canUseAiInsights({
        capabilities: {
          platform_ai_enabled: true,
          ai_assistant: { available: false, enabled: true, insights: { enabled: true } },
        },
        hasPermission: allow,
      }),
    ).toBe(false);
    expect(
      canUseAiInsights({
        capabilities: {
          platform_ai_enabled: true,
          ai_assistant: { available: true, enabled: true, insights: { enabled: false } },
        },
        hasPermission: allow,
      }),
    ).toBe(false);
  });
});

describe("canShowAiInsights", () => {
  it("shows entry points when org AI is on even without available key", async () => {
    const { canShowAiInsights } = await import("@/lib/ai-insights");
    expect(
      canShowAiInsights({
        capabilities: {
          platform_ai_enabled: true,
          ai_assistant: { available: false, enabled: true, insights: { enabled: true } },
        },
        hasPermission: () => true,
      }),
    ).toBe(true);
  });
});

describe("formatInsightClipboard", () => {
  it("formats summary and findings", () => {
    expect(
      formatInsightClipboard({
        summary: "Stock looks tight.",
        findings: ["SKU A below reorder", "SKU B selling fast"],
      }),
    ).toContain("Stock looks tight.");
    expect(formatInsightClipboard(null)).toBe("");
  });
});
