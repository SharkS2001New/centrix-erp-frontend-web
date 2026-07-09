import { printFontFormDefaults } from "@/lib/print-font-settings";

export const GENERAL_DEFAULTS = {
  currency: "KES",
  timezone: "Africa/Nairobi",
  date_format: "DD/MM/YYYY",
  language: "en",
  decimal_places: 2,
  number_thousands_separator: "comma",
  fiscal_year_start_month: 1,
  week_starts_on: "monday",
  phone_country_code: "+254",
  default_country_code: "KE",
  document_footer_text: "",
  show_organization_on_documents: true,
  document_header_display: "auto",
  enable_tab_workspace: true,
  ...printFontFormDefaults(),
};

export const CURRENCY_OPTIONS = [{ value: "KES", label: "KES — Kenyan Shilling" }];

export const TIMEZONE_OPTIONS = [{ value: "Africa/Nairobi", label: "Africa/Nairobi (EAT)" }];

export const DATE_FORMAT_OPTIONS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "sw", label: "Swahili" },
];

export const DECIMAL_PLACES_OPTIONS = [
  { value: "0", label: "0 (whole numbers)" },
  { value: "2", label: "2 (standard)" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
];

export const THOUSANDS_SEPARATOR_OPTIONS = [
  { value: "comma", label: "Comma (1,234.56)" },
  { value: "space", label: "Space (1 234.56)" },
  { value: "none", label: "None (1234.56)" },
];

export const DOCUMENT_HEADER_DISPLAY_OPTIONS = [
  { value: "auto", label: "Logo when available, otherwise company name" },
  { value: "logo", label: "Company logo only" },
  { value: "name", label: "Company name only" },
  { value: "logo_and_name", label: "Logo and company name" },
];

export const FISCAL_MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "4", label: "April" },
  { value: "7", label: "July" },
  { value: "10", label: "October" },
];

export function mergeGeneralSettings(moduleSettings) {
  return { ...GENERAL_DEFAULTS, ...(moduleSettings?.general ?? {}) };
}

import { printFontFormFromGeneral } from "@/lib/print-font-settings";

export function generalFormFromApi(res) {
  const general = mergeGeneralSettings({ general: res?.general ?? res });
  return {
    currency: general.currency || "KES",
    timezone: general.timezone || "Africa/Nairobi",
    date_format: general.date_format || "DD/MM/YYYY",
    language: general.language || "en",
    decimal_places: String(general.decimal_places ?? 2),
    number_thousands_separator: general.number_thousands_separator || "comma",
    fiscal_year_start_month: String(general.fiscal_year_start_month ?? 1),
    week_starts_on: general.week_starts_on || "monday",
    phone_country_code: general.phone_country_code || "+254",
    default_country_code: general.default_country_code || "KE",
    document_footer_text: general.document_footer_text || "",
    show_organization_on_documents: Boolean(general.show_organization_on_documents),
    document_header_display: general.document_header_display || "auto",
    enable_tab_workspace: general.enable_tab_workspace !== false,
    ...printFontFormFromGeneral(general),
  };
}

export function generalPayloadFromForm(form, { includePlatformFields = false } = {}) {
  const payload = {
    currency: form.currency || "KES",
    timezone: form.timezone || "Africa/Nairobi",
    date_format: form.date_format || "DD/MM/YYYY",
    language: form.language || "en",
    decimal_places: Number(form.decimal_places) || 2,
    number_thousands_separator: form.number_thousands_separator || "comma",
    fiscal_year_start_month: Number(form.fiscal_year_start_month) || 1,
    week_starts_on: form.week_starts_on || "monday",
    phone_country_code: form.phone_country_code || "+254",
    default_country_code: form.default_country_code || "KE",
  };

  if (includePlatformFields) {
    payload.enable_tab_workspace = Boolean(form.enable_tab_workspace);
  }

  return payload;
}
