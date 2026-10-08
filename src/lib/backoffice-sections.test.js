import { describe, expect, it } from "vitest";
import {
  isBackofficeSectionEnabled,
  normalizeBackofficeSections,
} from "@/lib/backoffice-sections";
import { isBackofficePathDisabled } from "@/lib/route-access";

describe("backoffice sections", () => {
  it("keeps every section on when the organization has no map", () => {
    expect(isBackofficeSectionEnabled({}, "suppliers")).toBe(true);
    expect(normalizeBackofficeSections(null).customers).toBe(true);
  });

  it("turns off only the section the organization disabled", () => {
    const capabilities = {
      module_settings: { sales: { backoffice_sections: { suppliers: false, customers: true } } },
    };
    expect(isBackofficeSectionEnabled(capabilities, "suppliers")).toBe(false);
    expect(isBackofficeSectionEnabled(capabilities, "customers")).toBe(true);
  });

  it("blocks a suppliers URL when that section is off", () => {
    const capabilities = {
      module_settings: { sales: { backoffice_sections: { suppliers: false } } },
    };
    expect(isBackofficePathDisabled("/suppliers", capabilities)).toBe(true);
    expect(isBackofficePathDisabled("/lpo", capabilities)).toBe(true);
    expect(isBackofficePathDisabled("/customers", capabilities)).toBe(false);
  });
});
