"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeAppLoading } from "@/lib/app-loading";

/** Thin top bar — immediate feedback when opening a page. */
export function NavigationProgressBar() {
  const [navigating, setNavigating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return subscribeAppLoading(({ navigating: nextNavigating, pageNavigationActive }) => {
      setNavigating(nextNavigating || pageNavigationActive);
    });
  }, []);

  if (!mounted || !navigating || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[180] h-[3px] overflow-hidden"
      aria-hidden="true"
    >
      <div className="navigation-progress-track h-full w-full bg-[var(--theme-primary)]/15">
        <div className="navigation-progress-indeterminate h-full bg-[var(--theme-primary)]" />
      </div>
    </div>,
    document.body,
  );
}

/** True while a clicked route is still opening (drives the in-page skeleton). */
export function useNavigationBusy() {
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeAppLoading(({ navigating }) => {
        setBusy(navigating);
      }),
    [],
  );

  return busy;
}

/** Destination URL clicked by the user (for page-driven skeletons). */
export function usePendingNavigationHref() {
  const [href, setHref] = useState(null);

  useEffect(() => subscribeAppLoading(({ pendingHref }) => setHref(pendingHref)), []);

  return href;
}
