/** Parse API/print date values without Invalid Date on datetime strings. */
export function parsePrintDate(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const datePart = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const d = new Date(`${datePart}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatPrintDisplayDate(value, { emptyLabel = "" } = {}) {
  const d = parsePrintDate(value);
  if (!d) return emptyLabel;
  return d.toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
