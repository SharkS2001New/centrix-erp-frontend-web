/** Map server progress to a friendly stage label. */
export function resolveBackgroundTaskMessage(task, fallback = "Please wait…") {
  const serverMessage = task?.progress_message ?? task?.payload?.progress_message;
  if (typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage.trim();
  }

  const progress = Number(task?.progress ?? 0);
  if (progress < 5) return "Starting…";
  if (progress < 30) return "Started fetching…";
  if (progress < 70) return "Loading data…";
  if (progress < 90) return "Please wait…";
  if (progress < 100) return "Almost done…";
  return fallback;
}
