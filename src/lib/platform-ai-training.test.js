import { describe, expect, it } from "vitest";
import { parseTrainingQaPaste } from "@/lib/platform-ai-training";

describe("parseTrainingQaPaste", () => {
  it("parses Q/A blocks with optional path", () => {
    const notes = parseTrainingQaPaste(`
Q: Where is GRN?
A: Open /inventory/receipts to receive goods.
Path: /inventory/receipts

Question: Is stock in kg or bags?
Answer: Use the product UoM — base units with mixed display like 2 Bag, 40 kg.
`);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual({
      question: "Where is GRN?",
      answer: "Open /inventory/receipts to receive goods.",
      path: "/inventory/receipts",
    });
    expect(notes[1].question).toBe("Is stock in kg or bags?");
  });
});
