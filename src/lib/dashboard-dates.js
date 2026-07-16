/** Format a Date as YYYY-MM-DD in the local timezone (avoid UTC shift from toISOString). */
export function toLocalDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultDashboardDateRange(days = 29) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return {
    from: toLocalDateInputValue(from),
    to: toLocalDateInputValue(to),
  };
}

export function currentMonthDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: toLocalDateInputValue(from),
    to: toLocalDateInputValue(now),
  };
}

export function yearToDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), 0, 1);
  return {
    from: toLocalDateInputValue(from),
    to: toLocalDateInputValue(now),
  };
}
