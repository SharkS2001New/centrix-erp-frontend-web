import { describe, expect, it } from "vitest";
import { onboardingGuideStorageKey, videoDemoEmbedUrl } from "@/lib/onboarding-guide";

describe("onboarding guide", () => {
  it("scopes completion to both user and organization", () => {
    expect(onboardingGuideStorageKey(12, 34)).toBe("centrix_onboarding_v1:user:12:org:34");
    expect(onboardingGuideStorageKey(12, null)).toBeNull();
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

  it("rejects malformed, insecure, and unsupported video links", () => {
    expect(videoDemoEmbedUrl("not a url")).toBeNull();
    expect(videoDemoEmbedUrl("http://youtu.be/abcdefghijk")).toBeNull();
    expect(videoDemoEmbedUrl("https://example.com/video")).toBeNull();
    expect(videoDemoEmbedUrl("https://youtube.com/watch?v=short")).toBeNull();
  });
});
