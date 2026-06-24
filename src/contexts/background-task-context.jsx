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

const NAV_BACK = "__back__";

function isInternalAppHref(href) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return false;
  }
  return href.startsWith("/");
}

function normalizeNavHref(href) {
  if (typeof href === "string") {
    return href;
  }
  if (href && typeof href === "object" && typeof href.pathname === "string") {
    return href.pathname;
  }
  return null;
}

export function BackgroundTaskProvider({ children }) {
  const router = useRouter();
  const [activeTask, setActiveTask] = useState(null);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState(null);
  const abortRef = useRef(null);
  const routerMethodsRef = useRef(null);

  const clearActiveTask = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveTask(null);
    setOverlayDismissed(false);
  }, []);

  const runBackgroundTask = useCallback(
    async (requestFn, opts = {}) => {
      if (activeTask) {
        throw new Error("Another background task is already running.");
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const label = opts.label ?? opts.message ?? "Working in the background…";

      setOverlayDismissed(false);
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
          timeoutMs: opts.timeoutMs ?? 1_800_000,
          intervalMs: opts.intervalMs,
          maxIntervalMs: opts.maxIntervalMs,
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

  const minimizeActiveTask = useCallback(() => {
    if (!activeTask) return;
    setOverlayDismissed(true);
  }, [activeTask]);

  const confirmNavigation = useCallback(
    async (shouldCancel) => {
      const href = pendingNavHref;
      setPendingNavHref(null);
      if (!href) return;

      if (shouldCancel) {
        await cancelActiveTask();
        if (href === NAV_BACK) {
          router.back();
        } else {
          router.push(href);
        }
      }
    },
    [cancelActiveTask, pendingNavHref, router],
  );

  const queueNavigation = useCallback((href) => {
    const normalized = normalizeNavHref(href);
    if (!normalized || !isInternalAppHref(normalized)) {
      return false;
    }
    if (normalized === window.location.pathname) {
      return false;
    }
    setPendingNavHref(normalized);
    return true;
  }, []);

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

  useEffect(() => {
    if (!activeTask) {
      if (routerMethodsRef.current) {
        router.push = routerMethodsRef.current.push;
        router.replace = routerMethodsRef.current.replace;
        router.back = routerMethodsRef.current.back;
        routerMethodsRef.current = null;
      }
      return undefined;
    }

    if (!routerMethodsRef.current) {
      routerMethodsRef.current = {
        push: router.push.bind(router),
        replace: router.replace.bind(router),
        back: router.back.bind(router),
      };
    }

    const original = routerMethodsRef.current;

    router.push = (href, options) => {
      if (queueNavigation(href)) {
        return Promise.resolve(false);
      }
      return original.push(href, options);
    };

    router.replace = (href, options) => {
      if (queueNavigation(href)) {
        return Promise.resolve(false);
      }
      return original.replace(href, options);
    };

    router.back = () => {
      setPendingNavHref(NAV_BACK);
    };

    return () => {
      router.push = original.push;
      router.replace = original.replace;
      router.back = original.back;
    };
  }, [activeTask, queueNavigation, router]);

  useEffect(() => {
    if (!activeTask) return undefined;

    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [activeTask]);

  const value = useMemo(
    () => ({
      activeTask,
      overlayDismissed,
      busy: Boolean(activeTask),
      runBackgroundTask,
      cancelActiveTask,
      minimizeActiveTask,
      queueNavigation,
    }),
    [
      activeTask,
      overlayDismissed,
      cancelActiveTask,
      minimizeActiveTask,
      queueNavigation,
      runBackgroundTask,
    ],
  );

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
      {!overlayDismissed ? (
        <BackgroundTaskIndicator
          task={activeTask}
          onCancel={() => void cancelActiveTask()}
          onMinimize={minimizeActiveTask}
        />
      ) : null}
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
