import { describe, expect, it } from "vitest";
import {
  isRetryableSpeechError,
  plainTextForSpeech,
  preferredSpeechLang,
  speechErrorMessage,
  spokenBriefForSpeech,
} from "@/lib/ai-voice";

describe("plainTextForSpeech", () => {
  it("strips markdown and code fences", () => {
    const raw = "## Hello\n\nSee `/reports/sales-by-user` and **bold**.\n```chart\n{}\n```";
    expect(plainTextForSpeech(raw)).toBe("Hello See /reports/sales-by-user and bold.");
  });

  it("caps length for TTS", () => {
    const long = "a".repeat(2000);
    expect(plainTextForSpeech(long).length).toBe(1200);
  });
});

describe("spokenBriefForSpeech", () => {
  it("speaks only the direct float answer, not the detail list", () => {
    const raw = [
      "Diana: opening float KES 20,000.00. Cash KES 5,000.00, M-Pesa KES 12,000.00, bank KES 0.00. Expected cash in drawer about KES 25,000.00.",
      "",
      "Detail (2026-09-26):",
      "- Opening float: **KES 20,000.00**",
      "- Cash collected: **KES 5,000.00**",
      "",
      "Open [Till management](/sales/till-management) to verify.",
    ].join("\n");
    const brief = spokenBriefForSpeech(raw);
    expect(brief).toMatch(/Diana: opening float KES 20,000/);
    expect(brief).toMatch(/M-Pesa/);
    expect(brief).not.toMatch(/Detail/);
    expect(brief).not.toMatch(/Till management/);
    expect(brief.length).toBeLessThanOrEqual(420);
  });
});

describe("preferredSpeechLang", () => {
  it("falls back to en-US for unsupported English locales like en-KE", () => {
    const original = navigator.language;
    Object.defineProperty(navigator, "language", { configurable: true, get: () => "en-KE" });
    expect(preferredSpeechLang()).toBe("en-US");
    Object.defineProperty(navigator, "language", { configurable: true, get: () => original });
  });
});

describe("speech errors", () => {
  it("treats network as retryable", () => {
    expect(isRetryableSpeechError("network")).toBe(true);
    expect(isRetryableSpeechError("not-allowed")).toBe(false);
  });

  it("explains network failures clearly", () => {
    expect(speechErrorMessage("network")).toMatch(/transcrib/i);
  });
});

describe("canUseBrowserSpeechRecognition", () => {
  it("is exported", async () => {
    const { canUseBrowserSpeechRecognition, canUseVoiceInput } = await import("@/lib/ai-voice");
    expect(typeof canUseBrowserSpeechRecognition).toBe("function");
    expect(typeof canUseVoiceInput).toBe("function");
  });
});
