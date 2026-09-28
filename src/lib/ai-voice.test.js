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
  it("speaks Kenyan Shillings instead of KES", () => {
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
    expect(brief).toMatch(/Diana: opening float Kenyan Shillings 20,000/);
    expect(brief).toMatch(/M-Pesa/);
    expect(brief).not.toMatch(/\bKES\b/);
    expect(brief).toMatch(/Expected cash/);
    expect(brief).not.toMatch(/Detail/);
    expect(brief).not.toMatch(/Till management/);
    expect(brief.length).toBeLessThanOrEqual(560);
  });

  it("keeps greetings to a short spoken line", () => {
    const brief = spokenBriefForSpeech("Hi — how can I help with Centrix today?");
    expect(brief).toMatch(/^Hi/);
    expect(brief.length).toBeLessThanOrEqual(120);
  });

  it("speaks totals from a daily sales table instead of dropping figures", () => {
    const raw = [
      "Naomi (@NAOMI) daily gross sales, 22–28 September, all branches:",
      "",
      "| Date | Orders | Gross sales (KES) |",
      "| --- | ---: | ---: |",
      "| Tue 22 Sep | 96 | 470,775 |",
      "| Wed 23 Sep | 99 | 451,655 |",
      "| Mon 28 Sep | 162 | 716,525 |",
      "| Total | 766 | 3,393,650 |",
      "",
      "All fully paid, nothing unpaid. Sunday was her only quiet day.",
    ].join("\n");
    const brief = spokenBriefForSpeech(raw);
    expect(brief).toMatch(/Naomi/i);
    expect(brief).toMatch(/3,393,650/);
    expect(brief).toMatch(/766/);
    expect(brief).toMatch(/716,525|Mon 28 Sep/i);
    expect(brief).toMatch(/chat/i);
    expect(brief.length).toBeLessThanOrEqual(560);
  });

  it("keeps up to three spoken sentences without cutting mid-word", () => {
    const raw =
      "Yes, there were 15 unusual large orders this week. " +
      "There were also 15 after-hours sales on 26 September. " +
      "The average order was about KES 10,576, and the biggest was KES 750,500 on 23 September.";
    const brief = spokenBriefForSpeech(raw);
    expect(brief).toMatch(/15 unusual large orders/);
    expect(brief).toMatch(/after-hours/);
    expect(brief).toMatch(/23 September/);
    expect(brief).not.toMatch(/Septembe$/);
    expect(brief).not.toMatch(/Kenyan Shillings \(Kenyan Shillings\)/);
    expect(brief.length).toBeLessThanOrEqual(560);
  });

  it("speaks screen locations in words instead of paths", () => {
    const brief = spokenBriefForSpeech(
      "Today 13 employees clocked in. The full history is on /hr/attendance and /hr/attendance/history.",
    );
    expect(brief).toMatch(/HR Attendance/);
    expect(brief).toMatch(/HR Attendance History/);
    expect(brief).not.toMatch(/\/hr\//);
  });

  it("humanizes single-segment paths like /price-history", () => {
    const brief = spokenBriefForSpeech(
      "The formal log is on the Price history screen at /price-history.",
    );
    expect(brief).toMatch(/Price History/);
    expect(brief).not.toMatch(/\/price-history/);
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
    expect(isCentrixWakePhrase("Talk to Centrix Assistant")).toBe(true);
  });

  it("ignores unrelated speech", () => {
    expect(isCentrixWakePhrase("what is my float")).toBe(false);
    expect(isCentrixWakePhrase("create an lpo")).toBe(false);
  });
});

describe("stripCentrixWakePrefix", () => {
  it("keeps the question after a wake greeting", async () => {
    const { stripCentrixWakePrefix } = await import("@/lib/ai-voice");
    expect(stripCentrixWakePrefix("Hi Centrix, what were sales today?")).toBe(
      "what were sales today?",
    );
    expect(stripCentrixWakePrefix("Talk to Centrix Assistant show low stock")).toBe(
      "show low stock",
    );
    expect(stripCentrixWakePrefix("Hi Centrix")).toBe("");
  });
});

describe("preferredSpeechLang", () => {
  it("falls back to en-GB for unsupported English locales like en-KE", () => {
    const original = navigator.language;
    Object.defineProperty(navigator, "language", { configurable: true, get: () => "en-KE" });
    expect(preferredSpeechLang()).toBe("en-GB");
    Object.defineProperty(navigator, "language", { configurable: true, get: () => original });
  });
});

describe("normalizeSpokenTranscript", () => {
  it("fixes common Kenyan retail STT mishears", async () => {
    const { normalizeSpokenTranscript } = await import("@/lib/ai-voice");
    expect(normalizeSpokenTranscript("create an elpo for kayes 5000")).toMatch(/LPO/);
    expect(normalizeSpokenTranscript("create an elpo for kayes 5000")).toMatch(/KES/);
    expect(normalizeSpokenTranscript("pay with empesa")).toMatch(/M-Pesa/);
  });
});

describe("looksLikeCompleteUtterance", () => {
  it("detects finished asks", async () => {
    const { looksLikeCompleteUtterance } = await import("@/lib/ai-voice");
    expect(looksLikeCompleteUtterance("what are sales today")).toBe(true);
    expect(looksLikeCompleteUtterance("show")).toBe(false);
    expect(looksLikeCompleteUtterance("Done.")).toBe(true);
  });
});

describe("warmTalkEngines", () => {
  it("is exported and idempotent when speech APIs are missing", async () => {
    const { warmTalkEngines } = await import("@/lib/ai-voice");
    expect(typeof warmTalkEngines).toBe("function");
    await expect(warmTalkEngines()).resolves.toBe(true);
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
