"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

/**
 * Centered progressive preloader for report/data screens (no cancel or background mode).
 * Hidden while a background export/task overlay is active to avoid duplicate preloaders.
 */
export function ReportLoadingOverlay({
  loading,
  title = "Loading report…",
  subtitle = "Fetching data…",
}) {
  const backgroundTasks = useBackgroundTasksOptional();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(subtitle);
  const intervalRef = useRef(null);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (loading) {
      wasLoadingRef.current = true;
      setVisible(true);
      setProgress(6);
      setMessage(subtitle);

      let value = 6;
      intervalRef.current = setInterval(() => {
        value = Math.min(90, value + (value < 35 ? 8 : value < 65 ? 5 : 2));
        setProgress(value);
        if (value >= 55 && value < 78) {
          setMessage("Processing results…");
        } else if (value >= 78) {
          setMessage("Almost ready…");
        }
      }, 360);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    if (!wasLoadingRef.current) {
      return undefined;
    }

    wasLoadingRef.current = false;
    setProgress(100);
    setMessage("Done");
    const doneTimer = setTimeout(() => {
      setVisible(false);
      setProgress(0);
      setMessage(subtitle);
    }, 280);

    return () => clearTimeout(doneTimer);
  }, [loading, subtitle]);

  if (backgroundTasks?.busy) return null;
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[170] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy={loading ? "true" : "false"}
    >
      <div className="pointer-events-auto w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#185FA5]"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{message}</p>
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#185FA5] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{Math.round(progress)}%</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
