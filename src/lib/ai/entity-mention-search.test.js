import { describe, expect, it } from "vitest";
import {
  detectMentionTrigger,
  insertMentionAtTrigger,
  mentionDisplayLabel,
  pruneEntityRefs,
  serializeEntityRefs,
} from "@/lib/ai/entity-mention-search";

describe("entity mention helpers", () => {
  it("detects @ trigger at caret", () => {
    expect(detectMentionTrigger("sales for @sug", 14)).toEqual({ start: 10, query: "sug" });
    expect(detectMentionTrigger("hello world", 5)).toBeNull();
  });

  it("inserts mention token and advances caret", () => {
    const trigger = { start: 10, query: "sug" };
    const result = insertMentionAtTrigger("sales for @sug", trigger, {
      type: "product",
      code: "SUG50",
      label: "Sugar 50kg",
    });
    expect(result.text).toBe("sales for @Sugar 50kg ");
    expect(result.caret).toBe("sales for @Sugar 50kg ".length);
  });

  it("prunes refs whose tokens were deleted", () => {
    const refs = [
      { type: "product", code: "A", label: "Alpha" },
      { type: "product", code: "B", label: "Beta" },
    ];
    expect(pruneEntityRefs("keep @Alpha here", refs)).toEqual([
      { type: "product", code: "A", label: "Alpha" },
    ]);
  });

  it("serializes refs for API", () => {
    expect(
      serializeEntityRefs([
        { type: "customer", code: "12", label: "Acme", id: null },
        { type: "user", id: "9", label: "Diana", code: null },
        { type: "employee", id: "3", code: "E001", label: "Jane Doe" },
        { type: "bad", label: "x" },
      ]),
    ).toEqual([
      { type: "customer", id: null, code: "12", label: "Acme" },
      { type: "user", id: "9", code: null, label: "Diana" },
      { type: "employee", id: "3", code: "E001", label: "Jane Doe" },
    ]);
    expect(mentionDisplayLabel({ label: "Acme Ltd" })).toBe("@Acme Ltd");
  });
});
