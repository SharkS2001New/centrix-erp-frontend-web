"use client";

import { useCallback, useState } from "react";
import { runQueuedTask } from "@/lib/background-task";
import { QueuedTaskOverlay } from "@/components/shared/queued-task-overlay";

const DEFAULT_MESSAGE = "Please wait while we process your request…";

/**
 * Run queued API work with a blocking full-screen preloader.
 * @param {string} [defaultMessage]
 */
export function useQueuedTask(defaultMessage = DEFAULT_MESSAGE) {
  const [overlay, setOverlay] = useState(null);

  const run = useCallback(
    async (requestFn, opts = {}) => {
      const message = opts.message ?? defaultMessage;
      setOverlay({ message, progress: null });
      try {
        return await runQueuedTask(requestFn, {
          ...opts,
          onProgress: (task) => {
            opts.onProgress?.(task);
            setOverlay((prev) =>
              prev
                ? {
                    ...prev,
                    progress: Number(task.progress ?? prev.progress ?? 0),
                  }
                : prev,
            );
          },
        });
      } finally {
        setOverlay(null);
      }
    },
    [defaultMessage],
  );

  const overlayNode = (
    <QueuedTaskOverlay
      open={Boolean(overlay)}
      message={overlay?.message ?? defaultMessage}
      progress={overlay?.progress}
    />
  );

  return {
    runQueuedTask: run,
    overlayNode,
    busy: Boolean(overlay),
  };
}
