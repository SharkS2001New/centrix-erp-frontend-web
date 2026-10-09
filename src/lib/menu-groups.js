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

function disabledMenuGroup(catalog) {
  return Object.fromEntries(catalog.map((section) => [section.key, false]));
}

/** A setup type only turns a menu group on when that application is included. */
export function menuGroupStateFromProfile(profile) {
  const groups = profile?.menu_groups ?? {};
  const apps = profile?.applications;
  const gated = apps && typeof apps === "object";
  const backofficeOn = !gated || apps.backoffice === true || apps.hospitality_backoffice === true;
  const hrOn = !gated || apps.hr === true;
  const accountingOn = !gated || apps.accounting === true;
  return {
    backoffice_sections: backofficeOn
      ? normalizeBackofficeSections(groups.backoffice)
      : disabledMenuGroup(BACKOFFICE_SECTION_CATALOG),
    hr_sections: hrOn
      ? normalizeMenuGroups(HR_MENU_CATALOG, groups.hr)
      : disabledMenuGroup(HR_MENU_CATALOG),
    accounting_sections: accountingOn
      ? normalizeMenuGroups(ACCOUNTING_MENU_CATALOG, groups.accounting)
      : disabledMenuGroup(ACCOUNTING_MENU_CATALOG),
  };
}

export { BACKOFFICE_SECTION_CATALOG, BACKOFFICE_SECTION_DEFAULTS };
