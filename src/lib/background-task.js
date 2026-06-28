import { apiRequest, ApiError, apiFetchBlob } from "@/lib/api";
import { humanizeBackgroundTaskError } from "@/lib/background-task-errors";

/** @param {string} taskId */
export function fetchBackgroundTask(taskId) {
  return apiRequest(`/background-tasks/${taskId}`, { loading: false, reportIssues: false });
}

/** @param {string} taskId */
export function cancelBackgroundTask(taskId) {
  return apiRequest(`/background-tasks/${taskId}/cancel`, {
    method: "POST",
    loading: false,
    reportIssues: false,
  });
}

/** @param {string} taskId @param {string} [filename] */
export async function downloadBackgroundTaskFile(taskId, filename = "export") {
  const blob = await apiFetchBlob(`/background-tasks/${taskId}/download`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Poll a background task until it completes or fails.
 * @param {string} taskId
 * @param {{
 *   intervalMs?: number,
 *   timeoutMs?: number,
 *   maxIntervalMs?: number,
 *   signal?: AbortSignal,
 *   onProgress?: (task: Record<string, unknown>) => void,
 * }} [opts]
 */
export async function waitForBackgroundTask(taskId, opts = {}) {
  let intervalMs = opts.intervalMs ?? 1500;
  const maxIntervalMs = opts.maxIntervalMs ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 1_800_000;
  const { onProgress, signal } = opts;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) {
      const error = new Error("Background task polling aborted.");
      error.name = "AbortError";
      throw error;
    }

    const task = await fetchBackgroundTask(taskId);
    onProgress?.(task);
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return task;
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timer);
          const error = new Error("Background task polling aborted.");
          error.name = "AbortError";
          reject(error);
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    intervalMs = Math.min(maxIntervalMs, Math.floor(intervalMs * 1.3));
  }

  throw new Error("Background task timed out.");
}

/** @param {Record<string, unknown> | null | undefined} res */
export function isQueuedTaskResponse(res) {
  return Boolean(res?.task_id);
}

/** @param {Record<string, unknown>} task */
export function backgroundTaskErrorMessage(task) {
  return humanizeBackgroundTaskError(task?.error_message);
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
  if (task.status === "cancelled") {
    return null;
  }

  return {
    ...res,
    ...(typeof task.result === "object" && task.result !== null ? task.result : {}),
    task,
  };
}
