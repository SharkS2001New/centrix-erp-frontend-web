const BACKGROUND_TASK_ERROR_PATTERNS = [
  {
    test: /^server error$/i,
    message: null,
  },
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
    if (test.test(raw)) {
      return friendly ?? fallback;
    }
  }

  return raw;
}

/** @param {unknown} error @param {string} [fallback] */
export function resolveImportTaskError(error, fallback = "Import failed.") {
  if (error && typeof error === "object" && "body" in error && error.body && typeof error.body === "object") {
    const body = error.body;
    const taskMessage = body.error_message ?? body.task?.error_message;
    if (typeof taskMessage === "string" && taskMessage.trim() && !/^server error$/i.test(taskMessage.trim())) {
      return humanizeBackgroundTaskError(taskMessage, fallback);
    }

    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail.trim();
    }

    const failures = body.failures ?? body.result?.failures;
    if (Array.isArray(failures) && failures.length) {
      const first = failures[0];
      const label = first.code ?? (first.row != null ? `Row ${first.row}` : "Row");
      return `${label}: ${first.message ?? "Import row failed."}`;
    }
  }

  if (error instanceof Error && error.message) {
    return humanizeBackgroundTaskError(error.message, fallback);
  }

  return humanizeBackgroundTaskError(null, fallback);
}
