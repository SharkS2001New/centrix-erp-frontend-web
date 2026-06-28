const BACKGROUND_TASK_ERROR_PATTERNS = [
  {
    test: /rows are required for inline export/i,
    message: "There is no data to export for this report.",
  },
  {
    test: /no rows to export/i,
    message: "There is no data to export for this report.",
  },
  {
    test: /export.*timed out/i,
    message: "The export took too long. Try a smaller date range or use CSV.",
  },
  {
    test: /background task timed out/i,
    message: "The task took too long and was stopped. Please try again.",
  },
];

export const EXPORT_EMPTY_ROWS_MESSAGE =
  "There is no data to export for this report.";

/** Turn server-side background task errors into user-facing messages. */
export function humanizeBackgroundTaskError(message, fallback = "The task could not be completed. Please try again.") {
  const raw = String(message ?? "").trim();
  if (!raw) return fallback;

  for (const { test, message: friendly } of BACKGROUND_TASK_ERROR_PATTERNS) {
    if (test.test(raw)) return friendly;
  }

  return raw;
}
