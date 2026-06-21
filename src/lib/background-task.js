import { apiRequest, ApiError } from "@/lib/api";

/** @param {string} taskId */
export function fetchBackgroundTask(taskId) {
  return apiRequest(`/background-tasks/${taskId}`);
}

/**
 * Poll a background task until it completes or fails.
 * @param {string} taskId
 * @param {{
 *   intervalMs?: number,
 *   timeoutMs?: number,
 *   onProgress?: (task: Record<string, unknown>) => void,
 * }} [opts]
 */
export async function waitForBackgroundTask(taskId, opts = {}) {
  const { intervalMs = 1500, timeoutMs = 600_000, onProgress } = opts;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const task = await fetchBackgroundTask(taskId);
    onProgress?.(task);
    if (task.status === "completed" || task.status === "failed") {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Background task timed out.");
}

/** @param {Record<string, unknown> | null | undefined} res */
export function isQueuedTaskResponse(res) {
  return Boolean(res?.task_id);
}

/** @param {Record<string, unknown>} task */
export function backgroundTaskErrorMessage(task) {
  return String(task?.error_message ?? "Background task failed.");
}

/**
 * Run an API call that may return 202 + task_id, then poll until done.
 * @param {() => Promise<Record<string, unknown>>} requestFn
 * @param {{
 *   intervalMs?: number,
 *   timeoutMs?: number,
 *   onProgress?: (task: Record<string, unknown>) => void,
 * }} [opts]
 */
export async function runQueuedTask(requestFn, opts = {}) {
  const res = await requestFn();
  if (!isQueuedTaskResponse(res)) {
    return res;
  }

  const task = await waitForBackgroundTask(String(res.task_id), opts);
  if (task.status === "failed") {
    throw new ApiError(backgroundTaskErrorMessage(task), 422, task);
  }

  return {
    ...res,
    ...(typeof task.result === "object" && task.result !== null ? task.result : {}),
    task,
  };
}
