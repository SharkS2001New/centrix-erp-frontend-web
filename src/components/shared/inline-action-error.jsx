import { ACTION_ERROR_CLASS } from "@/lib/action-feedback";

/** Prominent inline error for blocked actions (permissions, edit denied, etc.). */
export function InlineActionError({ message, className = "" }) {
  if (!message) return null;

  return (
    <p role="alert" className={`${ACTION_ERROR_CLASS} ${className}`.trim()}>
      {message}
    </p>
  );
}
