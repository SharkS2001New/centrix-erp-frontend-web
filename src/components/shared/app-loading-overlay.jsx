"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeAppLoading } from "@/lib/app-loading";
import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

const SHOW_DELAY_MS = 200;

/**
 * Global navigation + data loading overlay.
 * Blocks duplicate clicks while a page is opening or fetching.
 */
export function AppLoadingOverlay() {
  const backgroundTasks = useBackgroundTasksOptional();
  const [pending, setPending] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [label, setLabel] = useState("Loading…");
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef(null);
  const wasActiveRef = useRef(false);

  const active = pending > 0 || navigating;

  useEffect(() => {
    return subscribeAppLoading(({ pending: nextPending, label: nextLabel, navigating: nextNavigating }) => {
      setPending(nextPending);
      setNavigating(nextNavigating);
      setLabel(nextLabel);
    });
  }, []);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      showTimerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      return () => {
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
      };
    }

    if (!wasActiveRef.current) return undefined;

    wasActiveRef.current = false;
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    const doneTimer = setTimeout(() => setVisible(false), 150);
    return () => clearTimeout(doneTimer);
  }, [active]);

  if (backgroundTasks?.busy) return null;
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy="true"
      role="status"
    >
      <div className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px]" aria-hidden="true" />
      <div className="relative w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--theme-border)] border-t-[var(--theme-primary)]"
          aria-hidden="true"
        />
        <p className="theme-heading mt-4 text-sm font-semibold">{label}</p>
        <p className="theme-subtext mt-1 text-sm">Please wait — opening the page…</p>
      </div>
    </div>,
    document.body,
  );
}
