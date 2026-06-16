import { mergeGeneralSettings, GENERAL_DEFAULTS } from "@/lib/general-settings";

export function resolveGeneralSettings(capabilities) {
  return mergeGeneralSettings({
    general: capabilities?.general ?? capabilities?.module_settings?.general ?? {},
  });
}

export function resolveOrgSettings(settings) {
  return settings ?? GENERAL_DEFAULTS;
}

function thousandsSeparator(settings) {
  if (settings.number_thousands_separator === "space") return " ";
  if (settings.number_thousands_separator === "none") return "";
  return ",";
}

export function formatOrgNumber(value, settings, options = {}) {
  const general = settings ?? {};
  const decimals = options.decimals ?? general.decimal_places ?? 2;
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";

  const sep = thousandsSeparator(general);
  const [whole, fraction = ""] = Math.abs(num).toFixed(decimals).split(".");
  const withSep = sep ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : whole;
  const formatted = decimals > 0 ? `${withSep}.${fraction}` : withSep;

  return num < 0 ? `-${formatted}` : formatted;
}

export function formatOrgCurrency(value, settings) {
  const general = resolveOrgSettings(settings);
  const amount = formatOrgNumber(value, general);
  const currency = general.currency || "KES";
  return `${currency} ${amount}`;
}

export function formatOrgCurrencyCompact(value, settings) {
  const general = resolveOrgSettings(settings);
  const currency = general.currency || "KES";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${currency} ${(n / 1_000).toFixed(0)}K`;
  return formatOrgCurrency(n, general);
}

export function formatOrgDate(value, settings) {
  if (!value) return "—";
  const general = settings ?? {};
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  switch (general.date_format) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD/MM/YYYY":
    default:
      return `${day}/${month}/${year}`;
  }
}

export function formatOrgDateTime(value, settings) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const datePart = formatOrgDate(date, settings);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${datePart} ${hours}:${minutes}`;
}
