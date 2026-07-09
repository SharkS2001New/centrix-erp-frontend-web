"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

/**
 * Keeps recently visited tab pages mounted (hidden) so users can switch without losing state.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs } = useTabWorkspace();
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    cacheRef.current.set(normalizeTabHref(pathname), children);
  }, [children, enabled, pathname]);

  if (!enabled || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  const activeHref = normalizeTabHref(pathname);
  const visibleHrefs = new Set(tabs.map((tab) => tab.href));
  visibleHrefs.add(activeHref);

  return (
    <>
      {[...visibleHrefs].map((href) => {
        const isActive = href === activeHref;
        const cached = cacheRef.current.get(href);
        if (!isActive && !cached) return null;

        return (
          <div
            key={href}
            className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
            aria-hidden={!isActive}
            data-tab-workspace-pane={href}
          >
            {isActive ? children : cached}
          </div>
        );
      })}
    </>
  );
}
