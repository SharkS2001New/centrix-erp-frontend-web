"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeAppLoading } from "@/lib/app-loading";
import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

/** Only show the modal if loading takes longer than this — avoids flash on fast pages. */
const SHOW_DELAY_MS = 450;

/**
 * Reserved for slow data fetches (global GET during navigation), not routine page clicks.
 * Routine navigation uses the top progress bar + route skeleton instead.
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
    const doneTimer = setTimeout(() => setVisible(false), 120);
    return () => clearTimeout(doneTimer);
  }, [pending]);

  if (backgroundTasks?.busy) return null;
  if (!visible || pending <= 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]" aria-hidden="true" />
      <div className="relative w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--theme-border)] border-t-[var(--theme-primary)]"
          aria-hidden="true"
        />
        <p className="theme-heading mt-4 text-sm font-semibold">{label}</p>
        <p className="theme-subtext mt-1 text-sm">Fetching data…</p>
      </div>
    </div>,
    document.body,
  );
}
