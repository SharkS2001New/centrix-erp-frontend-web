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
        beginNavigationIntent("Opening page…");
        router.push(href, options);
      },
      replace(href, options) {
        if (isNavigationPending()) return;
        beginNavigationIntent("Opening page…");
        router.replace(href, options);
      },
      back() {
        if (isNavigationPending()) return;
        beginNavigationIntent("Going back…");
        router.back();
      },
      forward: router.forward,
      refresh: router.refresh,
      prefetch: router.prefetch,
    }),
    [router],
  );
}
