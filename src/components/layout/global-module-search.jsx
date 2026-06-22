"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { buildAccessContext } from "@/lib/access-control";
import { isTillFloatWorkflowEnabled } from "@/lib/sales-settings";
import {
  buildWorkspaceNavSections,
  flattenNavSearchEntries,
  searchNavEntries,
} from "@/lib/workspace-nav";
import { defaultWorkspaceId } from "@/lib/workspaces";

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3-3" />
    </svg>
  );
}

export function GlobalModuleSearch() {
  const router = useRouter();
  const { user, organization, capabilities, isModuleEnabled, hasPermission, isSuperAdmin } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const navContext = useMemo(
    () => ({
      isModuleEnabled,
      hasPermission,
      isSuperAdmin,
      requireTillFloat: isTillFloatWorkflowEnabled(capabilities?.module_settings),
      user,
      organization,
      capabilities,
    }),
    [capabilities, hasPermission, isModuleEnabled, isSuperAdmin, organization, user],
  );

  const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, navContext);
  const workspaceLabel = useMemo(() => {
    const workspaces = capabilities?.workspaces ?? [];
    return workspaces.find((w) => w.id === workspaceId)?.label ?? "this module";
  }, [capabilities?.workspaces, workspaceId]);

  const searchIndex = useMemo(() => {
    const sections = buildWorkspaceNavSections({
      capabilities,
      navContext,
      workspaceId,
      isSuperAdmin,
    });
    return flattenNavSearchEntries(sections);
  }, [capabilities, isSuperAdmin, navContext, workspaceId]);

  const results = useMemo(
    () => searchNavEntries(searchIndex, query),
    [query, searchIndex],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const goTo = useCallback(
    (href) => {
      if (!href) return;
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && query.trim()) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]?.href) {
      e.preventDefault();
      goTo(results[activeIndex].href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="app-topbar-search relative hidden min-w-0 flex-1 sm:block sm:max-w-md">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={`Search ${workspaceLabel}…`}
        className="app-topbar-search-input w-full rounded-md py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#405189]/25"
        aria-label={`Search pages and links in ${workspaceLabel}`}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />

      {open && query.trim() ? (
        <div
          className="velzon-search-dropdown absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-lg border shadow-lg"
          role="listbox"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm opacity-70">No pages or links match “{query.trim()}”.</p>
          ) : (
            results.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => goTo(entry.href)}
                className={`velzon-search-result flex w-full flex-col items-start px-4 py-2.5 text-left text-sm transition ${
                  index === activeIndex ? "velzon-search-result-active" : ""
                }`}
              >
                <span className="font-medium">{entry.label}</span>
                <span className="text-xs opacity-70">
                  {[entry.section, entry.group].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
