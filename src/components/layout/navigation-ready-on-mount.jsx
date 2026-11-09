"use client";

import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";

/** Clears the AppShell nav skeleton as soon as the destination screen module mounts. */
export function NavigationReadyOnMount({ children }) {
  usePageNavigationReady(true);
  return children;
}
