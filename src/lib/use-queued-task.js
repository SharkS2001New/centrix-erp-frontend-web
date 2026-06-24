"use client";

import { useCallback } from "react";
import { useBackgroundTasksOptional } from "@/contexts/background-task-context";
import { runQueuedTask as runQueuedTaskDirect } from "@/lib/background-task";

const DEFAULT_MESSAGE = "Please wait while we process your request…";

/**
 * Run queued API work with the global non-blocking background indicator when available.
 * @param {string} [defaultMessage]
 */
export function useQueuedTask(defaultMessage = DEFAULT_MESSAGE) {
  const backgroundTasks = useBackgroundTasksOptional();

  const run = useCallback(
    async (requestFn, opts = {}) => {
      const message = opts.message ?? opts.label ?? defaultMessage;

      if (backgroundTasks) {
        return backgroundTasks.runBackgroundTask(requestFn, {
          ...opts,
          label: message,
          message,
        });
      }

      return runQueuedTaskDirect(requestFn, { ...opts, message });
    },
    [backgroundTasks, defaultMessage],
  );

  return {
    runQueuedTask: run,
    overlayNode: null,
    busy: backgroundTasks?.busy ?? false,
  };
}
