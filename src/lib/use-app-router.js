"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { beginNavigationIntent, isNavigationPending } from "./app-loading";

/**
 * Drop-in router wrapper that shows navigation feedback and ignores duplicate pushes.
 */
export function useAppRouter() {
  const router = useRouter();

  return useMemo(
    () => ({
      push(href, options) {
        if (isNavigationPending()) return;
        const target = typeof href === "string" ? href : String(href);
        beginNavigationIntent("Opening page…", target);
        router.push(href, options);
      },
      replace(href, options) {
        if (isNavigationPending()) return;
        const target = typeof href === "string" ? href : String(href);
        beginNavigationIntent("Opening page…", target);
        router.replace(href, options);
      },
      back() {
        if (isNavigationPending()) return;
        beginNavigationIntent("Going back…", null);
        router.back();
      },
      forward: router.forward,
      refresh: router.refresh,
      prefetch: router.prefetch,
    }),
    [router],
  );
}
