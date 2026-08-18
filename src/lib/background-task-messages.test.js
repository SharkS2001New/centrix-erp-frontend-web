import { describe, expect, it } from "vitest";
import {
  backgroundTaskCountLabel,
  resolveBackgroundTaskMessage,
} from "@/lib/background-task-messages";

describe("resolveBackgroundTaskMessage", () => {
  it("prefers the server progress message over generic stages", () => {
    expect(
      resolveBackgroundTaskMessage({
        progress: 2,
        progress_message: "Calculating Jane Doe (12/85)…",
      }),
    ).toBe("Calculating Jane Doe (12/85)…");
  });

  it("falls back to Starting when there is no server message yet", () => {
    expect(resolveBackgroundTaskMessage({ progress: 0 })).toBe("Starting…");
  });
});

describe("backgroundTaskCountLabel", () => {
  it("formats processed of total", () => {
    expect(backgroundTaskCountLabel({ processed: 12, total: 85 })).toBe("12 of 85");
  });

  it("formats processed only when total is missing", () => {
    expect(backgroundTaskCountLabel({ processed: 400 })).toBe("400 processed");
  });

  it("returns null when counts are absent", () => {
    expect(backgroundTaskCountLabel({ progress: 10 })).toBeNull();
  });
});
