import { actionFeedbackClassName, isUserActionErrorMessage } from "@/lib/action-feedback";

export function ActionFeedbackBanner({ message, error, className = "mb-4" }) {
  if (!message) return null;
  const isError = error ?? isUserActionErrorMessage(message);

  return (
    <p
      role={isError ? "alert" : undefined}
      className={`${actionFeedbackClassName(message, { error: isError })} ${className}`.trim()}
    >
      {message}
    </p>
  );
}
