import { describe, expect, it } from "vitest";
import { latexToPlain, parseMarkdownHeading } from "@/lib/ai-message-format";

describe("ai message format", () => {
  it("converts LaTeX stock formula to plain Centrix field names", () => {
    const input =
      "$$\\text{Stock Value} = \\text{Cost Price} \\times \\text{Stock on Hand}$$";
    expect(latexToPlain(input)).toBe("Stock Value = Cost Price × Stock on Hand");
  });

  it("parses markdown headings used by the assistant", () => {
    expect(parseMarkdownHeading("### 1. How Centrix Calculates Stock Value")).toEqual({
      level: 3,
      text: "1. How Centrix Calculates Stock Value",
    });
  });
});
