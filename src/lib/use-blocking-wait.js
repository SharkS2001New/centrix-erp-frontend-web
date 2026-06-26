"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BlockingWaitOverlay } from "@/components/shared/blocking-wait-overlay";
import { runQueuedTask } from "@/lib/background-task";

const DEFAULT_MESSAGE = "Please wait while we process your request…";

function pseudoProgress(elapsedMs) {
  return Math.min(92, 4 + (elapsedMs / 45_000) * 88);
}

/**
 * Run an API call under a blocking wait overlay (no run-in-background, no cancel).
 * Supports optional server-reported progress when the API returns a background task id.
 */
export function useBlockingWait(defaultMessage = DEFAULT_MESSAGE) {
  const [waitState, setWaitState] = useState(null);
  const timerRef = useRef(null);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!waitState?.active) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return undefined;
    }

    startedRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      const pseudo = pseudoProgress(elapsed);
      setWaitState((current) => {
        if (!current?.active) return current;
        const server = current.serverProgress ?? 0;
        return {
          ...current,
          progress: Math.max(current.progress ?? 0, pseudo, server),
        };
      });
    }, 250);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [waitState?.active]);

  const runBlockingTask = useCallback(
    async (requestFn, opts = {}) => {
      const message = opts.message ?? opts.label ?? defaultMessage;
      const detail = opts.detail ?? null;

      setWaitState({
        active: true,
        message,
        detail,
        progress: 4,
        serverProgress: 0,
      });

      try {
        const result = await runQueuedTask(requestFn, {
          ...opts,
          onProgress: (task) => {
            opts.onProgress?.(task);
            const serverProgress = Number(task.progress ?? 0);
            if (serverProgress <= 0) return;
            setWaitState((current) =>
              current?.active
                ? {
                    ...current,
                    serverProgress,
                    progress: Math.max(current.progress ?? 0, serverProgress),
                  }
                : current,
            );
          },
        });

        setWaitState((current) =>
          current?.active ? { ...current, progress: 100, serverProgress: 100 } : current,
        );
        await new Promise((resolve) => setTimeout(resolve, 220));

        return result;
      } finally {
        setWaitState(null);
      }
    },
    [defaultMessage],
  );

  const overlayNode =
    waitState?.active ? (
      <BlockingWaitOverlay
        open
        message={waitState.message}
        detail={waitState.detail}
        progress={waitState.progress}
      />
    ) : null;

  return {
    runBlockingTask,
    overlayNode,
    busy: Boolean(waitState?.active),
  };
}
