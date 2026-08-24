import { describe, expect, it } from "vitest";
import {
  isMarkdownTableSeparator,
  latexToPlain,
  parseMarkdownHeading,
  parseMarkdownTableAt,
  splitMarkdownContentBlocks,
  splitMarkdownTableRow,
} from "@/lib/ai-message-format";

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

  it("parses GFM table rows and separators", () => {
    expect(splitMarkdownTableRow("| Product | Qty | Amount |")).toEqual([
      "Product",
      "Qty",
      "Amount",
    ]);
    expect(isMarkdownTableSeparator("|---|---:|:---|")).toBe(true);
    expect(isMarkdownTableSeparator("| Product | Qty |")).toBe(false);
  });

  it("parses a markdown table block with qty labels", () => {
    const lines = [
      "Top movers:",
      "| Product | Qty | Amount |",
      "|---|---|---|",
      "| Maize flour | 2 Bag, 40 kg | KES 4,800 |",
      "| Sugar | 15 kg | KES 2,100 |",
      "",
      "Done.",
    ];
    const parsed = parseMarkdownTableAt(lines, 1);
    expect(parsed).not.toBeNull();
    expect(parsed.table.headers).toEqual(["Product", "Qty", "Amount"]);
    expect(parsed.table.rows).toEqual([
      ["Maize flour", "2 Bag, 40 kg", "KES 4,800"],
      ["Sugar", "15 kg", "KES 2,100"],
    ]);
    expect(parsed.nextIndex).toBe(5);

    const blocks = splitMarkdownContentBlocks(lines);
    expect(blocks[0]).toMatchObject({ type: "line", line: "Top movers:" });
    expect(blocks[1]).toMatchObject({
      type: "table",
      headers: ["Product", "Qty", "Amount"],
    });
    expect(blocks[1].rows).toHaveLength(2);
    expect(blocks[2]).toMatchObject({ type: "line", line: "" });
    expect(blocks[3]).toMatchObject({ type: "line", line: "Done." });
  });
});
