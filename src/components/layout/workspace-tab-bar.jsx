"use client";

import { usePathname } from "next/navigation";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

export function WorkspaceTabBar() {
  const pathname = usePathname();
  const { enabled, tabs, activeHref, activateTab, closeTab } = useTabWorkspace();

  if (!enabled || tabs.length === 0 || !isTabWorkspaceRoute(pathname)) {
    return null;
  }

  return (
    <div
      className="workspace-tab-bar flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-[var(--theme-border)] bg-[var(--theme-panel-bg)] px-2 pt-1"
      role="tablist"
      aria-label="Open pages"
    >
      {tabs.map((tab) => {
        const isActive = normalizeTabHref(tab.href) === activeHref;
        const label = tab.dirty ? `${tab.title} *` : tab.title;

        return (
          <div
            key={tab.href}
            role="presentation"
            className={`group flex max-w-[220px] shrink-0 items-stretch rounded-t-md border border-b-0 ${
              isActive
                ? "border-[var(--theme-border)] bg-[var(--theme-page-bg)]"
                : "border-transparent bg-[var(--theme-panel-bg)] hover:bg-[var(--theme-page-bg)]/70"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              title={label}
              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-xs font-medium ${
                isActive ? "text-[var(--theme-text)]" : "text-[var(--theme-text-muted)]"
              }`}
              onClick={() => activateTab(tab.href)}
            >
              {label}
            </button>
            <button
              type="button"
              className="px-2 text-[var(--theme-text-muted)] opacity-60 hover:opacity-100"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.href);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
