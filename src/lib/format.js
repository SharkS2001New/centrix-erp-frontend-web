import { mergeGeneralSettings, GENERAL_DEFAULTS } from "@/lib/general-settings";
import {
  calendarDateInTimezone,
  formatAppDate,
  formatAppDateTimeWithSettings,
  normalizeDateInput,
  todayCalendarDate,
} from "@/lib/datetime";

export { todayCalendarDate, normalizeDateInput, calendarDateInTimezone };

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

  // Corrupted stock/cost figures can exceed JS safe formatting (toFixed → scientific at 1e21+).
  if (Math.abs(num) >= 1e15) return "—";

  const sep = thousandsSeparator(general);
  // Build fixed decimals without toFixed scientific notation for large magnitudes.
  const negative = num < 0;
  const abs = Math.abs(num);
  const factor = 10 ** decimals;
  const rounded = Math.round(abs * factor) / factor;
  let [whole, fraction = ""] = rounded.toFixed(decimals).split(".");
  // Guard: some engines still emit scientific notation for huge toFixed results.
  if (/e/i.test(whole) || /e/i.test(fraction)) return "—";
  const withSep = sep ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : whole;
  const formatted = decimals > 0 ? `${withSep}.${fraction}` : withSep;

  return negative ? `-${formatted}` : formatted;
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
  return formatAppDate(value, resolveOrgSettings(settings));
}

export function formatOrgDateTime(value, settings) {
  return formatAppDateTimeWithSettings(value, resolveOrgSettings(settings));
}
