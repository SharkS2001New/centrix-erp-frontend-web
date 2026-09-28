import { describe, expect, it } from "vitest";
import {
  assistantReplyNeedsPanel,
  isDetailedAssistantReply,
  isNavigateActionResult,
} from "@/lib/ai-assist-bridge";

describe("isNavigateActionResult", () => {
  it("detects navigate deep links", () => {
    expect(
      isNavigateActionResult({
        action_result: {
          result: { navigate: true, path: "/lpo", href: "/lpo" },
        },
      }),
    ).toBe(true);
  });

  it("ignores non-navigate action results", () => {
    expect(
      isNavigateActionResult({
        action_result: { result: { lpo_no: 12 } },
      }),
    ).toBe(false);
    expect(isNavigateActionResult({})).toBe(false);
  });
});

describe("isDetailedAssistantReply", () => {
  it("does not treat pure navigation as detailed Talk content", () => {
    expect(
      isDetailedAssistantReply(
        {
          action_result: {
            result: { navigate: true, path: "/lpo" },
          },
        },
        "Opening Purchase orders (LPO).",
      ),
    ).toBe(false);
  });

  it("still flags forms and pending writes", () => {
    expect(
      isDetailedAssistantReply({ pending_action: { type: "create_lpo" } }, "ok"),
    ).toBe(true);
    expect(assistantReplyNeedsPanel({ pending_action: { type: "create_lpo" } })).toBe(true);
  });
});
