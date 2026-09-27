import { describe, expect, it } from "vitest";
import {
  isRetryableSpeechError,
  isCentrixWakePhrase,
  isTalkEndPhrase,
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
    expect(brief).not.toMatch(/Expected cash/);
    expect(brief).not.toMatch(/Detail/);
    expect(brief).not.toMatch(/Till management/);
    expect(brief.length).toBeLessThanOrEqual(420);
  });

  it("keeps greetings to a short spoken line", () => {
    const brief = spokenBriefForSpeech("Hi — how can I help with Centrix today?");
    expect(brief).toMatch(/^Hi/);
    expect(brief.length).toBeLessThanOrEqual(120);
  });
});

describe("isTalkEndPhrase", () => {
  it("closes on nothing else / no / bye", () => {
    expect(isTalkEndPhrase("nothing else")).toBe(true);
    expect(isTalkEndPhrase("No")).toBe(true);
    expect(isTalkEndPhrase("no thanks")).toBe(true);
    expect(isTalkEndPhrase("that's all")).toBe(true);
    expect(isTalkEndPhrase("bye")).toBe(true);
  });

  it("does not treat real questions as end", () => {
    expect(isTalkEndPhrase("no stock for sugar")).toBe(false);
    expect(isTalkEndPhrase("what are sales today")).toBe(false);
  });
});

describe("isCentrixWakePhrase", () => {
  it("matches Hi Centrix and CentrixAssistant", () => {
    expect(isCentrixWakePhrase("Hi Centrix")).toBe(true);
    expect(isCentrixWakePhrase("Hello CentrixAssistant")).toBe(true);
    expect(isCentrixWakePhrase("hey centrix")).toBe(true);
    expect(isCentrixWakePhrase("Centrix")).toBe(true);
  });

  it("ignores unrelated speech", () => {
    expect(isCentrixWakePhrase("what is my float")).toBe(false);
    expect(isCentrixWakePhrase("create an lpo")).toBe(false);
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
