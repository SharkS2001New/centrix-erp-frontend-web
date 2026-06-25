"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  backgroundTaskErrorMessage,
  cancelBackgroundTask,
  downloadBackgroundTaskFile,
  isQueuedTaskResponse,
  waitForBackgroundTask,
} from "@/lib/background-task";
import { resolveBackgroundTaskMessage } from "@/lib/background-task-messages";
import { ApiError } from "@/lib/api";
import { BackgroundTaskExpandedModal } from "@/components/shared/background-task-expanded-modal";
import { BackgroundTaskNoticeDialog } from "@/components/shared/background-task-notice-dialog";

const BackgroundTaskContext = createContext(null);

const TASK_BUSY_MESSAGE = "Another background task is already running. Wait for it to finish before starting a new one.";

function taskErrorMessage(error) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Background task failed.";
}

export function BackgroundTaskProvider({ children }) {
  const [activeTask, setActiveTask] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState(null);
  const [taskLocked, setTaskLocked] = useState(false);
  const abortRef = useRef(null);

  const clearActiveTask = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveTask(null);
    setExpanded(false);
  }, []);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const runBackgroundTask = useCallback(
    async (requestFn, opts = {}) => {
      if (taskLocked || activeTask) {
        const busyError = new Error(TASK_BUSY_MESSAGE);
        setNotice({
          type: "error",
          title: "Task already running",
          message: TASK_BUSY_MESSAGE,
        });
        throw busyError;
      }

      setTaskLocked(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const label = opts.label ?? opts.message ?? "Working in the background…";

      setNotice(null);
      setExpanded(true);
      setActiveTask({
        id: "pending",
        label,
        progress: 0,
        message: "Starting…",
        status: "pending",
      });

      let taskId = null;
      let downloadFilename = opts.downloadFilename ?? "export";

      try {
        const res = await requestFn();
        if (!isQueuedTaskResponse(res)) {
          setTaskLocked(false);
          clearActiveTask();
          return res;
        }

        taskId = String(res.task_id);
        setActiveTask({
          id: taskId,
          label,
          progress: 0,
          message: "Queued…",
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
          clearActiveTask();
          return null;
        }

        const merged = {
          ...res,
          ...(typeof task.result === "object" && task.result !== null ? task.result : {}),
          task,
        };

        downloadFilename = merged.filename ?? downloadFilename;

        if (opts.downloadOnComplete && taskId) {
          await downloadBackgroundTaskFile(taskId, downloadFilename);
        }

        clearActiveTask();
        setNotice({
          type: "success",
          title: "Background task completed",
          taskLabel: label,
          message: opts.downloadOnComplete
            ? `Your file "${downloadFilename}" has been downloaded.`
            : "The task finished successfully.",
          downloadTaskId: opts.downloadOnComplete ? taskId : undefined,
          downloadFilename,
        });

        opts.onComplete?.(merged);
        return merged;
      } catch (error) {
        const cancelled =
          controller.signal.aborted
          || error?.name === "AbortError"
          || (error instanceof Error && error.message.includes("cancelled"));
        const message = cancelled ? "Background task was cancelled." : taskErrorMessage(error);

        clearActiveTask();

        if (!cancelled) {
          setNotice({
            type: "error",
            title: "Background task failed",
            taskLabel: label,
            message,
          });
        }

        if (cancelled) {
          return null;
        }

        opts.onError?.(error);
        throw error instanceof Error ? error : new Error(message);
      } finally {
        setTaskLocked(false);
      }
    },
    [activeTask, clearActiveTask, taskLocked],
  );

  const cancelActiveTask = useCallback(async () => {
    const taskId = activeTask?.id;

    if (taskId && taskId !== "pending") {
      try {
        await cancelBackgroundTask(taskId);
      } catch {
        /* best effort */
      }
    }

    abortRef.current?.abort();
    setTaskLocked(false);
    clearActiveTask();
  }, [activeTask?.id, clearActiveTask]);

  const expandActiveTask = useCallback(() => {
    if (!activeTask) return;
    setExpanded(true);
  }, [activeTask]);

  const minimizeActiveTask = useCallback(() => {
    if (!activeTask) return;
    setExpanded(false);
  }, [activeTask]);

  const downloadAgain = useCallback(async (taskId, filename) => {
    try {
      await downloadBackgroundTaskFile(taskId, filename);
    } catch (error) {
      setNotice({
        type: "error",
        title: "Download failed",
        message: taskErrorMessage(error),
      });
    }
  }, []);

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
      expanded,
      busy: Boolean(activeTask) || taskLocked,
      notice,
      runBackgroundTask,
      cancelActiveTask,
      expandActiveTask,
      minimizeActiveTask,
      taskLocked,
      dismissNotice,
    }),
    [
      activeTask,
      cancelActiveTask,
      dismissNotice,
      expandActiveTask,
      expanded,
      minimizeActiveTask,
      notice,
      runBackgroundTask,
      taskLocked,
    ],
  );

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
      {expanded && activeTask ? (
        <BackgroundTaskExpandedModal
          task={activeTask}
          onMinimize={minimizeActiveTask}
          onCancel={() => void cancelActiveTask()}
        />
      ) : null}
      <BackgroundTaskNoticeDialog
        notice={notice}
        onDismiss={dismissNotice}
        onDownloadAgain={(taskId, filename) => void downloadAgain(taskId, filename)}
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
