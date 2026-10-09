import {
  BACKOFFICE_SECTION_CATALOG,
  BACKOFFICE_SECTION_DEFAULTS,
  normalizeBackofficeSections,
  usesTillFloat,
} from "@/lib/backoffice-sections";

export const HR_MENU_CATALOG = [
  { key: "hr_people", label: "People" },
  { key: "hr_time_attendance", label: "Time & attendance" },
  { key: "hr_payroll", label: "Payroll" },
  { key: "hr_performance", label: "Performance" },
  { key: "reports", label: "Reports" },
];

export const ACCOUNTING_MENU_CATALOG = [
  { key: "accounting", label: "Accounting & finance" },
  { key: "expenses", label: "Expenses" },
  { key: "reports", label: "Reports" },
];

export function normalizeMenuGroups(catalog, raw) {
  const out = Object.fromEntries(catalog.map((section) => [section.key, true]));
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(out)) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = Boolean(raw[key]);
    }
  }
  return out;
}

export function hrSectionsFromCapabilities(capabilitiesOrSettings) {
  const sales =
    capabilitiesOrSettings?.module_settings?.sales ??
    capabilitiesOrSettings?.sales ??
    null;
  return normalizeMenuGroups(HR_MENU_CATALOG, sales?.hr_sections ?? capabilitiesOrSettings?.hr_sections);
}

export function accountingSectionsFromCapabilities(capabilitiesOrSettings) {
  const sales =
    capabilitiesOrSettings?.module_settings?.sales ??
    capabilitiesOrSettings?.sales ??
    null;
  return normalizeMenuGroups(
    ACCOUNTING_MENU_CATALOG,
    sales?.accounting_sections ?? capabilitiesOrSettings?.accounting_sections,
  );
}

export function isHrSectionEnabled(capabilitiesOrSettings, sectionId) {
  if (!sectionId) return true;
  const sections = hrSectionsFromCapabilities(capabilitiesOrSettings);
  if (!Object.prototype.hasOwnProperty.call(sections, sectionId)) return true;
  return sections[sectionId] !== false;
}

export function isAccountingSectionEnabled(capabilitiesOrSettings, sectionId) {
  if (!sectionId) return true;
  const sections = accountingSectionsFromCapabilities(capabilitiesOrSettings);
  if (!Object.prototype.hasOwnProperty.call(sections, sectionId)) return true;
  return sections[sectionId] !== false;
}

/** Reason a menu group cannot be turned off, keyed by section id. */
export function lockedMenuGroups(salesPlatform) {
  if (!usesTillFloat(salesPlatform)) return {};
  return {
    pos: "Till sessions stays on because this organisation uses till floats.",
  };
}

export function menuGroupStateFromProfile(profile) {
  const groups = profile?.menu_groups ?? {};
  return {
    backoffice_sections: normalizeBackofficeSections(groups.backoffice),
    hr_sections: normalizeMenuGroups(HR_MENU_CATALOG, groups.hr),
    accounting_sections: normalizeMenuGroups(ACCOUNTING_MENU_CATALOG, groups.accounting),
  };
}

export { BACKOFFICE_SECTION_CATALOG, BACKOFFICE_SECTION_DEFAULTS };
