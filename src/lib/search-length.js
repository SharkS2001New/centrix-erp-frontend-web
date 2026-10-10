import { notifyWarning } from "@/lib/notify";

/** Kept under MySQL's full-text phrase limit so a pasted number cannot crash search. */
export const MAX_SEARCH_LENGTH = 80;

export const SEARCH_TOO_LONG_MESSAGE =
  "That search is too long. Use a shorter name, code, or number.";

let warnedAt = 0;

/** One warning per burst, so holding a key does not stack toasts. */
export function warnSearchTooLong() {
  const now = Date.now();
  if (now - warnedAt < 2500) return;
  warnedAt = now;
  notifyWarning(SEARCH_TOO_LONG_MESSAGE);
}

/** Trim without a toast. Safe to call while rendering. */
export function clipSearchValue(value, max = MAX_SEARCH_LENGTH) {
  const text = String(value ?? "");
  return text.length <= max ? text : text.slice(0, max);
}

/** Keep the first 80 characters and warn once when the user goes past that. */
export function limitSearchValue(value) {
  const text = String(value ?? "");
  if (text.length <= MAX_SEARCH_LENGTH) return text;
  warnSearchTooLong();
  return text.slice(0, MAX_SEARCH_LENGTH);
}
