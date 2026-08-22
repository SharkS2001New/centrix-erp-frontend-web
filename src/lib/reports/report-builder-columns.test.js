import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  moveReportBuilderColumn,
  orderedReportBuilderPreviewKeys,
} from "@/lib/reports/report-builder-columns";
import {
  applyReportBuilderSuggestion,
  suggestReportBuilderWithAi,
} from "@/lib/reports/report-builder-ai-suggest";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "@/lib/api";

describe("moveReportBuilderColumn", () => {
  const cols = [
    { source: "sales", field: "sale_day", label: "Day" },
    { source: "sales", field: "order_total", label: "Total" },
    { source: "sales", field: "payment_status", label: "Status" },
  ];

  it("moves a column up and down within bounds", () => {
    expect(moveReportBuilderColumn(cols, 2, -1).map((c) => c.field)).toEqual([
      "sale_day",
      "payment_status",
      "order_total",
    ]);
    expect(moveReportBuilderColumn(cols, 0, 1).map((c) => c.field)).toEqual([
      "order_total",
      "sale_day",
      "payment_status",
    ]);
  });

  it("clamps out-of-range moves", () => {
    expect(moveReportBuilderColumn(cols, 0, -1)).toEqual(cols);
    expect(moveReportBuilderColumn(cols, 2, 5).map((c) => c.field)).toEqual([
      "sale_day",
      "order_total",
      "payment_status",
    ]);
    expect(moveReportBuilderColumn(cols, -1, 1)).toEqual(cols);
  });
});

describe("orderedReportBuilderPreviewKeys", () => {
  it("orders row keys to follow spec.columns", () => {
    const keys = orderedReportBuilderPreviewKeys(
      [
        { source: "sales", field: "payment_status" },
        { source: "sales", field: "sale_day" },
        { source: "sales", field: "order_total", aggregate: "sum" },
      ],
      ["sale_day", "order_total_sum", "payment_status", "extra"],
      (k) => k,
    );
    expect(keys).toEqual(["payment_status", "sale_day", "order_total_sum", "extra"]);
  });

  it("falls back to preferred aliases when there are no row keys", () => {
    const keys = orderedReportBuilderPreviewKeys(
      [
        { source: "sales", field: "sale_day" },
        { source: "sales", field: "order_total", alias: "total_sales" },
      ],
      [],
      (k) => k,
    );
    expect(keys).toEqual(["sale_day", "total_sales"]);
  });
});

describe("applyReportBuilderSuggestion", () => {
  it("applies name, description, and spec from the AI draft", () => {
    const applied = applyReportBuilderSuggestion(
      {
        name: "Daily sales",
        description: "By day",
        spec: {
          source: "sales",
          sources: ["sales"],
          columns: [{ source: "sales", field: "sale_day", label: "Day" }],
          group_by: ["sale_day"],
        },
      },
      { name: "Old", description: "Prev", spec: { sources: [], columns: [] } },
    );

    expect(applied.name).toBe("Daily sales");
    expect(applied.description).toBe("By day");
    expect(applied.spec.source).toBe("sales");
    expect(applied.spec.columns).toHaveLength(1);
    expect(applied.spec.group_by).toEqual(["sale_day"]);
  });
});

describe("suggestReportBuilderWithAi", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("posts instruction and workspace to the suggest endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      name: "Sales report",
      description: null,
      spec: { sources: ["sales"], columns: [{ field: "order_total" }] },
    });

    const result = await suggestReportBuilderWithAi({
      instruction: "  sales totals  ",
      workspaceId: "backoffice",
    });

    expect(apiRequest).toHaveBeenCalledWith("/reports/builder/suggest", {
      method: "POST",
      body: {
        instruction: "sales totals",
        workspace_id: "backoffice",
      },
    });
    expect(result.name).toBe("Sales report");
  });
});
