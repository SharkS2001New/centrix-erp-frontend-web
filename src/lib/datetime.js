/**
 * East Africa Time helpers for Centrix ERP.
 * Mirrors pitchpredictionswebsite DatetimeToUsersTimezone / GetTodaysDate patterns,
 * but always uses Africa/Nairobi instead of the browser timezone.
 */

export const APP_TIMEZONE = "Africa/Nairobi";

/** @param {unknown} dateValue */
export function normalizeDateInput(dateValue) {
  if (dateValue == null || dateValue === "") return null;

  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }

  if (typeof dateValue === "number" || /^\d{10,13}$/.test(String(dateValue).trim())) {
    const numeric = Number(dateValue);
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  let dateInput = String(dateValue).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return new Date(`${dateInput}T12:00:00+03:00`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateInput)) {
    const [datePart, timePart = "00:00"] = dateInput.split(" ");
    const [day, month, year] = datePart.split("/");
    dateInput = `${year}-${month}-${day}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateInput)) {
    dateInput = dateInput.replace(" ", "T");
    if (/T\d{2}:\d{2}$/.test(dateInput)) {
      dateInput += ":00";
    }
  }

  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(dateInput) && /T/.test(dateInput)) {
    dateInput += "+03:00";
  }

  const date = new Date(dateInput);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar date (YYYY-MM-DD) in the application timezone. */
export function calendarDateInTimezone(value, timeZone = APP_TIMEZONE) {
  const date = normalizeDateInput(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function todayCalendarDate(timeZone = APP_TIMEZONE) {
  return calendarDateInTimezone(new Date(), timeZone);
}

export function formatInTimezone(value, options, timeZone = APP_TIMEZONE) {
  const date = normalizeDateInput(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-KE", { ...options, timeZone }).format(date);
}

export function formatAppDateTime(value) {
  if (!value) return "—";
  return (
    formatInTimezone(value, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) ?? "—"
  );
}

export function formatAppDate(value, settings) {
  if (!value) return "—";

  const iso =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
      ? value.trim()
      : calendarDateInTimezone(value);
  if (!iso) return String(value);

  const [year, month, day] = iso.split("-");
  const dateFormat = settings?.date_format ?? "DD/MM/YYYY";

  switch (dateFormat) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return iso;
    case "DD/MM/YYYY":
    default:
      return `${day}/${month}/${year}`;
  }
}

export function formatAppDateTimeWithSettings(value, settings) {
  if (!value) return "—";
  const datePart = formatAppDate(value, settings);
  const timePart = formatInTimezone(value, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return timePart ? `${datePart} ${timePart}` : datePart;
}

/** @deprecated Use APP_TIMEZONE */
export const NAIROBI_TZ = APP_TIMEZONE;
