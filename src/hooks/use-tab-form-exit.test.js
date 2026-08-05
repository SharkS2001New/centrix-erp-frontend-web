import { describe, expect, it } from "vitest";
import {
  tabAddTitle,
  tabDetailTitle,
  tabEditTitle,
  tabNameFirstWord,
} from "@/hooks/use-tab-form-exit";

describe("tab title helpers", () => {
  it("takes the first word of a record name", () => {
    expect(tabNameFirstWord("ABABIL PERBOILED 25KG")).toBe("ABABIL");
    expect(tabNameFirstWord("  Moonlight Express Ltd  ")).toBe("Moonlight");
    expect(tabNameFirstWord("")).toBe("");
  });

  it("builds detail titles as Entity - FirstWord", () => {
    expect(tabDetailTitle("Product", "ABABIL PERBOILED 25KG")).toBe("Product - ABABIL");
    expect(tabDetailTitle("customer", "OMEGA PRIME DISTRIBUTORS LTD")).toBe(
      "Customer - OMEGA",
    );
    expect(tabDetailTitle("Supplier", "")).toBe("Supplier");
    expect(tabDetailTitle("menu product", "Grilled Chicken")).toBe("Menu Product - Grilled");
  });

  it("builds short edit titles", () => {
    expect(tabEditTitle("Product", "ABABIL PERBOILED 25KG")).toBe("Edit Product - ABABIL");
    expect(tabEditTitle("customer", "Moonlight Express")).toBe("Edit customer - Moonlight");
  });

  it("keeps add titles unchanged", () => {
    expect(tabAddTitle("product")).toBe("Add product");
  });
});
