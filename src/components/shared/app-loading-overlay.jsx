"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeAppLoading } from "@/lib/app-loading";
import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

const SHOW_DELAY_MS = 300;

/**
 * Global centered preloader for API activity across the application.
 */
export function AppLoadingOverlay() {
  const backgroundTasks = useBackgroundTasksOptional();
  const [pending, setPending] = useState(0);
  const [label, setLabel] = useState("Loading…");
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef(null);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    return subscribeAppLoading(({ pending: nextPending, label: nextLabel }) => {
      setPending(nextPending);
      setLabel(nextLabel);
    });
  }, []);

  useEffect(() => {
    if (pending > 0) {
      wasPendingRef.current = true;
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      showTimerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      return () => {
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
      };
    }

    if (!wasPendingRef.current) return undefined;

    wasPendingRef.current = false;
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    const doneTimer = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(doneTimer);
  }, [pending]);

  if (backgroundTasks?.busy) return null;
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[170] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy={pending > 0 ? "true" : "false"}
    >
      <div className="pointer-events-auto w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#185FA5]"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-sm text-slate-600">
          {pending > 0 ? "Please wait…" : "Done"}
        </p>
      </div>
    </div>,
    document.body,
  );
}
