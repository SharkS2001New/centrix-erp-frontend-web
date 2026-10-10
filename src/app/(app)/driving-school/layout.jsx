"use client";

import { usePathname } from "next/navigation";
import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";

export default function DrivingLayout({ children }) {
  const pathname = usePathname();
  // Dismiss the shell "Opening page…" cover on each driving route. These screens
  // are not in the tab registry, so nothing else signals that the page has settled.
  usePageNavigationReady(pathname);
  return children;
}
