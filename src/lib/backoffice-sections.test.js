import { describe, expect, it } from "vitest";
import {
  isBackofficeSectionEnabled,
  normalizeBackofficeSections,
  usesTillFloat,
} from "@/lib/backoffice-sections";
import { isHrSectionEnabled, lockedMenuGroups, menuGroupStateFromProfile } from "@/lib/menu-groups";
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

  it("keeps till operations on when the organisation uses a till float", () => {
    const capabilities = {
      module_settings: {
        sales: {
          require_backoffice_till_float: true,
          backoffice_sections: { pos: false },
        },
      },
    };
    expect(usesTillFloat(capabilities)).toBe(true);
    expect(isBackofficeSectionEnabled(capabilities, "pos")).toBe(true);
    expect(lockedMenuGroups(capabilities.module_settings.sales).pos).toMatch(/Till sessions/);
  });

  it("reads the menu groups saved on a setup type", () => {
    const state = menuGroupStateFromProfile({
      menu_groups: {
        hr: { hr_payroll: false, hr_people: true },
      },
    });
    expect(state.hr_sections.hr_payroll).toBe(false);
    expect(state.hr_sections.hr_people).toBe(true);
    expect(isHrSectionEnabled({ module_settings: { sales: { hr_sections: state.hr_sections } } }, "hr_payroll")).toBe(false);
  });
});
