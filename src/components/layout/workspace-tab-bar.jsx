"use client";

import { usePathname } from "next/navigation";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

function TabCloseIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function WorkspaceTabBar() {
  const pathname = usePathname();
  const { enabled, tabs, activeHref, activateTab, closeTab } = useTabWorkspace();

  if (!enabled || tabs.length === 0 || !isTabWorkspaceRoute(pathname)) {
    return null;
  }

  return (
    <div
      className="workspace-tab-bar flex shrink-0 items-end gap-1 overflow-x-auto border-b border-[var(--theme-border)] bg-[var(--theme-panel-bg)] px-3 pb-0 pt-2 [scrollbar-width:thin]"
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
            className={`group relative flex max-w-[240px] min-w-[120px] shrink-0 items-stretch rounded-t-lg border border-b-0 transition-colors duration-150 ${
              isActive
                ? "z-[1] -mb-px border-[var(--theme-border)] bg-[var(--theme-page-bg)] shadow-[0_-1px_0_0_var(--theme-primary)_inset]"
                : "mb-0 border-transparent bg-[color-mix(in_srgb,var(--theme-page-bg)_40%,var(--theme-panel-bg))] hover:border-[var(--theme-border)]/60 hover:bg-[var(--theme-page-bg)]/80"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              title={label}
              className={`flex min-w-0 flex-1 items-center gap-1.5 truncate py-2 pl-3.5 pr-1 text-left text-[13px] leading-tight ${
                isActive
                  ? "font-semibold text-[var(--theme-text)]"
                  : "font-medium text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text)]"
              }`}
              onClick={() => activateTab(tab.href)}
            >
              {tab.dirty ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
              <span className="truncate">{tab.title}</span>
              {tab.dirty ? <span className="sr-only"> (unsaved)</span> : null}
            </button>
            <button
              type="button"
              className="mr-1.5 flex shrink-0 items-center justify-center self-center rounded-md p-1 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(tab.href);
              }}
            >
              <TabCloseIcon className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
