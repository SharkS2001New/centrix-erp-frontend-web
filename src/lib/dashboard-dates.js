/** Parse API/form billing date (YYYY-MM-DD or ISO datetime) as local calendar day. */
export function parseApiDateValue(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const plain = parseLocalDateInputValue(raw);
  if (plain) return plain;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/** Normalize API datetime or YYYY-MM-DD to a date input value. */
export function apiDateToInputValue(value) {
  const d = parseApiDateValue(value);
  return d ? toLocalDateInputValue(d) : "";
}

/** Format a Date as YYYY-MM-DD in the local timezone (avoid UTC shift from toISOString). */
export function toLocalDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as a local calendar date (noon avoids DST edge cases). */
export function parseLocalDateInputValue(value) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Inclusive calendar-day span between two YYYY-MM-DD values (same day = 1). */
export function inclusiveDashboardDaySpan(from, to) {
  const a = parseLocalDateInputValue(from);
  const b = parseLocalDateInputValue(to);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

/** Today-only range (non–Backoffice / non–Sales analytics dashboards). */
export function todayDashboardDateRange() {
  const today = toLocalDateInputValue();
  return { from: today, to: today };
}

/** Inclusive window ending today. Pass 0 for today-only; pass 6 for last 7 days. */
export function defaultDashboardDateRange(days = 0) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return {
    from: toLocalDateInputValue(from),
    to: toLocalDateInputValue(to),
  };
}

/** Backoffice dashboard default: last 7 calendar days (inclusive). */
export function lastWeekDashboardDateRange() {
  return defaultDashboardDateRange(6);
}

/**
 * Keep From ≤ To and enforce a minimum inclusive span (Backoffice: 7 days).
 * When the span is too short, extend the side the user did not just edit.
 *
 * @param {string} from
 * @param {string} to
 * @param {{ minInclusiveDays?: number, changed?: 'from'|'to' }} [options]
 */
export function clampDashboardDateRange(from, to, { minInclusiveDays = 7, changed = "to" } = {}) {
  let nextFrom = String(from ?? "").trim();
  let nextTo = String(to ?? "").trim();
  if (!nextFrom || !nextTo) return { from: nextFrom, to: nextTo };

  const fromDate = parseLocalDateInputValue(nextFrom);
  const toDate = parseLocalDateInputValue(nextTo);
  if (!fromDate || !toDate) return { from: nextFrom, to: nextTo };

  if (fromDate.getTime() > toDate.getTime()) {
    if (changed === "from") {
      nextTo = nextFrom;
    } else {
      nextFrom = nextTo;
    }
  }

  const span = inclusiveDashboardDaySpan(nextFrom, nextTo);
  const minDays = Math.max(1, Number(minInclusiveDays) || 1);
  if (span >= minDays) {
    return { from: nextFrom, to: nextTo };
  }

  const extendBy = minDays - 1;
  if (changed === "from") {
    const end = parseLocalDateInputValue(nextFrom);
    end.setDate(end.getDate() + extendBy);
    nextTo = toLocalDateInputValue(end);
  } else {
    const start = parseLocalDateInputValue(nextTo);
    start.setDate(start.getDate() - extendBy);
    nextFrom = toLocalDateInputValue(start);
  }

  return { from: nextFrom, to: nextTo };
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
