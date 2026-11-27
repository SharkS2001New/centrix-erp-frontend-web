import { describe, expect, it } from "vitest";
import { buildReportCategories } from "./catalog-ui";

describe("inventory report catalog", () => {
  it("includes the stock transfers report when the API catalog omits it", () => {
    const inventory = buildReportCategories({}).find(
      (category) => category.id === "inventory",
    );

    expect(inventory?.reports).toContainEqual({
      key: "stock-transfers",
      label: "Stock Transfers Report",
      href: "/reports/stock-transfers",
    });
  });
});
