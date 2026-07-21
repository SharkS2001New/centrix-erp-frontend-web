/** Format a Date as YYYY-MM-DD in the local timezone (avoid UTC shift from toISOString). */
export function toLocalDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Business summary / sales analytics default: today only. */
export function todayDashboardDateRange() {
  const today = toLocalDateInputValue();
  return { from: today, to: today };
}

/** Inclusive window ending today. Pass 0 for today-only. */
export function defaultDashboardDateRange(days = 0) {
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
