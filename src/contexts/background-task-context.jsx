"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  backgroundTaskErrorMessage,
  cancelBackgroundTask,
  downloadBackgroundTaskFile,
  isQueuedTaskResponse,
  waitForBackgroundTask,
} from "@/lib/background-task";
import { resolveBackgroundTaskMessage } from "@/lib/background-task-messages";
import { ApiError } from "@/lib/api";
import { BackgroundTaskIndicator } from "@/components/shared/background-task-indicator";
import { BackgroundTaskNavDialog } from "@/components/shared/background-task-nav-dialog";

const BackgroundTaskContext = createContext(null);

function isInternalAppHref(href) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return false;
  }
  return href.startsWith("/");
}

export function BackgroundTaskProvider({ children }) {
  const router = useRouter();
  const [activeTask, setActiveTask] = useState(null);
  const [pendingNavHref, setPendingNavHref] = useState(null);
  const abortRef = useRef(null);

  const clearActiveTask = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveTask(null);
  }, []);

  const runBackgroundTask = useCallback(
    async (requestFn, opts = {}) => {
      if (activeTask) {
        throw new Error("Another background task is already running.");
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const label = opts.label ?? opts.message ?? "Working in the background…";

      setActiveTask({
        id: "pending",
        label,
        progress: 0,
        message: "Starting…",
        status: "pending",
      });

      try {
        const res = await requestFn();
        if (!isQueuedTaskResponse(res)) {
          clearActiveTask();
          return res;
        }

        const taskId = String(res.task_id);
        setActiveTask({
          id: taskId,
          label,
          progress: 2,
          message: "Started fetching…",
          status: "running",
        });

        const task = await waitForBackgroundTask(taskId, {
          ...opts,
          signal: controller.signal,
          onProgress: (nextTask) => {
            opts.onProgress?.(nextTask);
            setActiveTask({
              id: taskId,
              label,
              progress: Number(nextTask.progress ?? 0),
              message: resolveBackgroundTaskMessage(nextTask, label),
              status: String(nextTask.status ?? "running"),
            });
          },
        });

        if (task.status === "failed") {
          throw new ApiError(backgroundTaskErrorMessage(task), 422, task);
        }

        if (task.status === "cancelled") {
          throw new Error("Background task was cancelled.");
        }

        const merged = {
          ...res,
          ...(typeof task.result === "object" && task.result !== null ? task.result : {}),
          task,
        };

        if (opts.downloadOnComplete && taskId) {
          await downloadBackgroundTaskFile(
            taskId,
            merged.filename ?? opts.downloadFilename ?? "export",
          );
        }

        clearActiveTask();
        opts.onComplete?.(merged);
        return merged;
      } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") {
          clearActiveTask();
          throw new Error("Background task was cancelled.");
        }
        clearActiveTask();
        opts.onError?.(error);
        throw error;
      }
    },
    [activeTask, clearActiveTask],
  );

  const cancelActiveTask = useCallback(async () => {
    const taskId = activeTask?.id;
    abortRef.current?.abort();

    if (taskId && taskId !== "pending") {
      try {
        await cancelBackgroundTask(taskId);
      } catch {
        /* best effort */
      }
    }

    clearActiveTask();
  }, [activeTask?.id, clearActiveTask]);

  const confirmNavigation = useCallback(
    async (shouldCancel) => {
      const href = pendingNavHref;
      setPendingNavHref(null);
      if (!href) return;

      if (shouldCancel) {
        await cancelActiveTask();
        router.push(href);
      }
    },
    [cancelActiveTask, pendingNavHref, router],
  );

  useEffect(() => {
    if (!activeTask) return undefined;

    const handler = (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!isInternalAppHref(href)) return;
      if (href === window.location.pathname) return;
      if (anchor.target === "_blank") return;
      if (anchor.dataset.backgroundNav === "allow") return;

      event.preventDefault();
      event.stopPropagation();
      setPendingNavHref(href);
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [activeTask]);

  const value = useMemo(
    () => ({
      activeTask,
      busy: Boolean(activeTask),
      runBackgroundTask,
      cancelActiveTask,
    }),
    [activeTask, cancelActiveTask, runBackgroundTask],
  );

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
      <BackgroundTaskIndicator task={activeTask} onCancel={() => void cancelActiveTask()} />
      <BackgroundTaskNavDialog
        open={Boolean(pendingNavHref)}
        onStay={() => confirmNavigation(false)}
        onCancelAndLeave={() => void confirmNavigation(true)}
      />
    </BackgroundTaskContext.Provider>
  );
}

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTaskContext);
  if (!ctx) {
    throw new Error("useBackgroundTasks must be used within BackgroundTaskProvider");
  }
  return ctx;
}

export function useBackgroundTasksOptional() {
  return useContext(BackgroundTaskContext);
}
