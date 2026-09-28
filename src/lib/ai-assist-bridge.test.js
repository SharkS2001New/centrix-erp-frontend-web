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

  it("keeps mid-collect writes in Talk (no panel) until ready to confirm", () => {
    const collecting = {
      pending_action: {
        type: "create_lpo",
        ready_to_confirm: false,
        params: { supplier_id: 12, supplier_name: "Bidco" },
      },
    };
    expect(isDetailedAssistantReply(collecting, "Got Bidco — nothing is saved yet.")).toBe(false);
    expect(assistantReplyNeedsPanel(collecting)).toBe(false);
  });

  it("opens the panel for forms and ready-to-confirm writes", () => {
    expect(
      isDetailedAssistantReply(
        { pending_action: { type: "create_lpo", ready_to_confirm: true } },
        "Ready to save.",
      ),
    ).toBe(true);
    expect(
      assistantReplyNeedsPanel({
        pending_action: { type: "create_lpo", ready_to_confirm: true },
      }),
    ).toBe(true);
    expect(
      assistantReplyNeedsPanel({
        form_spec: { fields: [{ name: "supplier_id" }] },
      }),
    ).toBe(true);
  });

  it("does not treat a short Q&A or bare action_result as needing the panel", () => {
    expect(
      isDetailedAssistantReply(
        { action_result: { success: true, message: "Updated" } },
        "Price updated to KES 250.",
      ),
    ).toBe(false);
    expect(
      assistantReplyNeedsPanel({
        action_result: { success: true, message: "Updated" },
      }),
    ).toBe(false);
    expect(
      isDetailedAssistantReply({}, "Today sales were Kenyan Shillings 12,000 across 4 orders."),
    ).toBe(false);
  });
});
