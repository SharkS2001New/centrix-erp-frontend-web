import { describe, expect, it } from "vitest";
import { plainTextForSpeech } from "@/lib/ai-voice";

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
