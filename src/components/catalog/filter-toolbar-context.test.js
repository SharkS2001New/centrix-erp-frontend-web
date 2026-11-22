import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterToolbar } from "@/components/catalog/catalog-shared";
import {
  inferFilterControlLabel,
  useShouldShowFilterLabel,
} from "@/components/catalog/filter-toolbar-context";

function LabelAwareControl() {
  return createElement(
    "span",
    null,
    useShouldShowFilterLabel() ? "auto label" : "existing label",
  );
}

describe("inferFilterControlLabel", () => {
  it("uses explicit labels and singularizes common filter names", () => {
    expect(inferFilterControlLabel({ ariaLabel: "All branches" })).toBe("Branch");
    expect(inferFilterControlLabel({ placeholder: "All categories" })).toBe("Category");
  });

  it("skips generic placeholders and grouped option headers", () => {
    expect(
      inferFilterControlLabel({
        placeholder: "Select",
        options: [
          { label: "Inventory", isHeader: true },
          { label: "All products", value: "" },
        ],
      }),
    ).toBe("Product");
  });

  it("provides a meaningful fallback for unnamed controls", () => {
    expect(inferFilterControlLabel({ type: "search" })).toBe("Search");
    expect(inferFilterControlLabel({})).toBe("Filter");
  });
});

describe("filter toolbar labels", () => {
  it("does not add duplicate labels inside an explicitly labelled filter group", () => {
    const markup = renderToStaticMarkup(
      createElement(
        FilterToolbar,
        null,
        createElement(
          "div",
          null,
          createElement("label", null, "Sale date"),
          createElement("input", { type: "date" }),
        ),
        createElement(
          "div",
          null,
          createElement("label", null, "Branch"),
          createElement(LabelAwareControl),
        ),
      ),
    );

    expect(markup).toContain('aria-label="Sale date"');
    expect(markup).not.toContain(">Date</span>");
    expect(markup).toContain("existing label");
    expect(markup).not.toContain("auto label");
  });
});
