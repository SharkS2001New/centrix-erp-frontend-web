/** Shared styling for permission / validation errors users must notice. */
export const ACTION_ERROR_CLASS =
  "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300";

export const ACTION_SUCCESS_CLASS =
  "rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-[var(--theme-border)] dark:bg-[var(--theme-surface-muted)] dark:text-[var(--theme-text)]";

const ERROR_HINTS = [
  "not allowed",
  "cannot be edited",
  "can only re-edit",
  "can only revise",
  "can only operate",
  "do not have permission",
  "do not have access",
  "you can only",
  "you are not",
  "you're not",
  "failed",
  "could not",
  "unable to",
  "denied",
  "forbidden",
  "unauthorized",
  "not found",
  "invalid",
  "required",
];

export function isUserActionErrorMessage(message) {
  if (!message) return false;
  const lower = String(message).toLowerCase();
  return ERROR_HINTS.some((hint) => lower.includes(hint));
}

export function actionFeedbackClassName(message, { error } = {}) {
  const isError = error === true || (error !== false && isUserActionErrorMessage(message));
  return isError ? ACTION_ERROR_CLASS : ACTION_SUCCESS_CLASS;
}
