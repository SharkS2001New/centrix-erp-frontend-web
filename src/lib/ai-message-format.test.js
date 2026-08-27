import { describe, expect, it } from "vitest";
import {
  coerceChartPayload,
  isMarkdownTableSeparator,
  latexToPlain,
  parseMarkdownHeading,
  parseMarkdownTableAt,
  preferredChartType,
  splitMarkdownContentBlocks,
  splitMarkdownTableRow,
  userAskedForChart,
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
    expect(parseMarkdownHeading("#### HR & payroll")).toEqual({
      level: 4,
      text: "HR & payroll",
    });
    expect(parseMarkdownHeading("#### Unusually large orders")).toEqual({
      level: 4,
      text: "Unusually large orders",
    });
    expect(parseMarkdownHeading("###### Tiny")).toEqual({
      level: 6,
      text: "Tiny",
    });
    expect(parseMarkdownHeading("####### Too many")).toBeNull();
  });

  it("parses GFM table rows and separators", () => {
    expect(splitMarkdownTableRow("| Product | Qty | Amount |")).toEqual([
      "Product",
      "Qty",
      "Amount",
    ]);
    expect(isMarkdownTableSeparator("|---|---:|:---|")).toBe(true);
    expect(isMarkdownTableSeparator("|---|--:|:--:|--:|")).toBe(true);
    expect(isMarkdownTableSeparator("| Product | Qty |")).toBe(false);
  });

  it("parses short LLM alignment separators into a real table", () => {
    const lines = [
      "| Category | Amount (KES) | Entries |",
      "|---|--:|:--:|",
      "| **Utilities** | 751,435 | 11 |",
      "| **Other** | 380 | 2 |",
      "| **Total** | **751,815** | **13** |",
    ];
    const blocks = splitMarkdownContentBlocks(lines);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    expect(blocks[0].rows).toHaveLength(3);
  });

  it("parses chart fences", () => {
    const lines = [
      "Breakdown:",
      "```chart",
      '{"type":"bar","items":[{"label":"Utilities","value":100},{"label":"Other","value":20}]}',
      "```",
      "Done.",
    ];
    const blocks = splitMarkdownContentBlocks(lines);
    expect(blocks[1]).toMatchObject({
      type: "chart",
      chart: {
        type: "bar",
        items: [
          { label: "Utilities", value: 100 },
          { label: "Other", value: 20 },
        ],
      },
    });
  });

  it("repairs duplicate-key chart items and hides broken fence text", () => {
    const broken =
      '{"type":"bar","title":"Purchases","items":[{"label":"SUGAR 50 KG","value":1084000,"label":"BANJAB RICE 25KG","value":332700,"label":"STAR BIRIYANI","value":221000}]}';
    const repaired = coerceChartPayload(broken);
    expect(repaired).toMatchObject({
      type: "bar",
      title: "Purchases",
      items: [
        { label: "SUGAR 50 KG", value: 1084000 },
        { label: "BANJAB RICE 25KG", value: 332700 },
        { label: "STAR BIRIYANI", value: 221000 },
      ],
    });

    const lines = ["Intro", "```chart", broken, "```", "After"];
    const blocks = splitMarkdownContentBlocks(lines);
    expect(blocks.map((b) => b.type)).toEqual(["line", "chart", "line"]);
    expect(blocks[1].chart.items).toHaveLength(3);
    expect(blocks.some((b) => b.type === "line" && String(b.line).includes("```"))).toBe(false);
  });

  it("detects when the user asked for a chart and which type", () => {
    expect(userAskedForChart("Show expenses as a pie chart")).toBe(true);
    expect(preferredChartType("Show expenses as a pie chart")).toBe("pie");
    expect(preferredChartType("donut please")).toBe("donut");
    expect(preferredChartType("bar chart of sales")).toBe("bar");
    expect(preferredChartType("show a chart")).toBe(null);
    expect(userAskedForChart("Can you graph sales by cashier?")).toBe(true);
    expect(userAskedForChart("Expenses by category this month")).toBe(false);
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
