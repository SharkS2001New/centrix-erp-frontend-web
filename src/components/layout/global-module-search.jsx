"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { apiRequest } from "@/lib/api";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { useAppRouter } from "@/lib/use-app-router";
import { isTillFloatWorkflowEnabled } from "@/lib/sales-settings";
import {
  buildModuleSearchRows,
  entitySearchConfigsForWorkspace,
  filterEntityConfigsByAccess,
  searchWorkspaceEntities,
  selectableSearchRows,
  workspaceSearchPlaceholder,
} from "@/lib/module-entity-search";
import {
  buildWorkspaceNavSections,
  flattenNavSearchEntries,
  searchNavEntries,
} from "@/lib/workspace-nav";
import { defaultWorkspaceId } from "@/lib/workspaces";
import { canAskAiFromSearch } from "@/lib/ai-settings";
import { requestAiAssist } from "@/lib/ai-assist-bridge";
import { looksLikeSearchQuestion, searchAskAiPrompt } from "@/lib/search-ai-prompt";

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3-3" />
    </svg>
  );
}

export function GlobalModuleSearch() {
  const router = useAppRouter();
  const { adminPath } = useAdminApi();
  const { user, organization, capabilities, isModuleEnabled, hasPermission, hasNavPermission, isSuperAdmin } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entityGroups, setEntityGroups] = useState([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const containerRef = useRef(null);
  const entityRequestRef = useRef(0);

  const navContext = useMemo(
    () => ({
      isModuleEnabled,
      hasPermission,
      hasNavPermission,
      isSuperAdmin,
      requireTillFloat: isTillFloatWorkflowEnabled(capabilities?.module_settings),
      user,
      organization,
      capabilities,
    }),
    [capabilities, hasNavPermission, hasPermission, isModuleEnabled, isSuperAdmin, organization, user],
  );

  const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(capabilities, navContext);
  const workspaceLabel = useMemo(() => {
    const workspaces = capabilities?.workspaces ?? [];
    return workspaces.find((w) => w.id === workspaceId)?.label ?? "this module";
  }, [capabilities?.workspaces, workspaceId]);

  const placeholder = useMemo(
    () => workspaceSearchPlaceholder(workspaceId, workspaceLabel),
    [workspaceId, workspaceLabel],
  );

  const entityConfigs = useMemo(
    () => filterEntityConfigsByAccess(entitySearchConfigsForWorkspace(workspaceId), hasPermission),
    [hasPermission, workspaceId],
  );

  const searchIndex = useMemo(() => {
    const sections = buildWorkspaceNavSections({
      capabilities,
      navContext,
      workspaceId,
      isSuperAdmin,
    });
    return flattenNavSearchEntries(sections);
  }, [capabilities, isSuperAdmin, navContext, workspaceId]);

  const navResults = useMemo(() => searchNavEntries(searchIndex, query, { limit: 6 }), [query, searchIndex]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || entityConfigs.length === 0) {
      setEntityGroups([]);
      setEntityLoading(false);
      return undefined;
    }

    const requestId = entityRequestRef.current + 1;
    entityRequestRef.current = requestId;
    setEntityLoading(true);

    const timer = window.setTimeout(() => {
      searchWorkspaceEntities(apiRequest, entityConfigs, trimmed, {
        limitPerType: 4,
        adminPath,
        workspaceId,
        organizationId: organization?.id ?? user?.organization_id,
      })
        .then((groups) => {
          if (entityRequestRef.current !== requestId) return;
          setEntityGroups(groups);
        })
        .catch(() => {
          if (entityRequestRef.current !== requestId) return;
          setEntityGroups([]);
        })
        .finally(() => {
          if (entityRequestRef.current !== requestId) return;
          setEntityLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [adminPath, entityConfigs, query, workspaceId]);

  const rows = useMemo(
    () => buildModuleSearchRows(navResults, entityGroups, query),
    [entityGroups, navResults, query],
  );

  const selectableRows = useMemo(() => selectableSearchRows(rows), [rows]);

  const trimmedQuery = query.trim();
  const canAskAi = canAskAiFromSearch({ capabilities, hasPermission });
  const askAiMessage = useMemo(
    () => (canAskAi ? searchAskAiPrompt(trimmedQuery, workspaceLabel) : ""),
    [canAskAi, trimmedQuery, workspaceLabel],
  );
  const showAskAiEmpty = canAskAi && !entityLoading && rows.length === 0 && trimmedQuery.length >= 2;
  const showAskAiFooter =
    canAskAi &&
    !entityLoading &&
    rows.length > 0 &&
    trimmedQuery.length >= 2 &&
    looksLikeSearchQuestion(trimmedQuery);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, rows]);

  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setEntityGroups([]);
  }, []);

  const handleAskAi = useCallback(() => {
    if (!askAiMessage) return;
    closeSearch();
    requestAiAssist({ message: askAiMessage, autoSend: true });
  }, [askAiMessage, closeSearch]);

  const goTo = useCallback(
    (href) => {
      if (!href) return;
      closeSearch();
      router.push(href);
    },
    [closeSearch, router],
  );

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && query.trim()) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, selectableRows.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter" && selectableRows[activeIndex]?.href) {
      e.preventDefault();
      goTo(selectableRows[activeIndex].href);
    } else if (e.key === "Enter" && (showAskAiEmpty || showAskAiFooter)) {
      e.preventDefault();
      handleAskAi();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim();
  const activeHref = selectableRows[activeIndex]?.href ?? null;

  return (
    <div ref={containerRef} className="app-topbar-search relative hidden min-w-0 flex-1 sm:block sm:max-w-xl md:max-w-2xl">
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
        placeholder={placeholder}
        className="app-topbar-search-input w-full py-2 pl-9 pr-3 text-sm outline-none"
        aria-label={`Search records and pages in ${workspaceLabel}`}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
      />

      {showDropdown ? (
        <div
          className="velzon-search-dropdown absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-96 overflow-y-auto rounded-lg border shadow-lg"
          role="listbox"
        >
          {entityLoading && rows.length === 0 ? (
            <p className="px-4 py-3 text-sm opacity-70">Searching {workspaceLabel}…</p>
          ) : null}

          {!entityLoading && rows.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-sm opacity-70">No pages or records match “{trimmedQuery}”.</p>
              {showAskAiEmpty ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleAskAi}
                  className="velzon-search-result mt-3 flex w-full cursor-pointer flex-col items-start rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2.5 text-left text-sm text-indigo-950 transition hover:bg-indigo-100"
                >
                  <span className="font-medium">Ask AI</span>
                  <span className="mt-0.5 text-xs text-indigo-800/80">{askAiMessage}</span>
                </button>
              ) : null}
            </div>
          ) : (
            rows.map((row) => {
              if (row.kind === "heading") {
                return (
                  <div
                    key={row.id}
                    className="velzon-search-result px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide opacity-60"
                  >
                    {row.label}
                  </div>
                );
              }

              const selectableIndex = selectableRows.findIndex((item) => item.id === row.id);
              const isActive = row.href === activeHref && selectableIndex === activeIndex;

              if (!row.href) return null;

              return (
                <AppNavLink
                  key={row.id}
                  href={row.href}
                  role="option"
                  aria-selected={isActive}
                  prefetch={!String(row.href).includes("?")}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    if (selectableIndex >= 0) setActiveIndex(selectableIndex);
                  }}
                  onClick={closeSearch}
                  className={`velzon-search-result flex w-full cursor-pointer flex-col items-start px-4 py-2.5 text-left text-sm no-underline transition ${
                    isActive ? "velzon-search-result-active" : ""
                  } ${row.kind === "entity-list" ? "border-t border-[var(--theme-border)]/60 italic" : ""}`}
                >
                  <span className="font-medium">{row.label}</span>
                  {row.subtitle ? <span className="text-xs opacity-70">{row.subtitle}</span> : null}
                </AppNavLink>
              );
            })
          )}

          {entityLoading && rows.length > 0 ? (
            <p className="border-t border-[var(--theme-border)]/60 px-4 py-2 text-xs opacity-60">
              Loading more matches…
            </p>
          ) : null}

          {showAskAiFooter ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAskAi}
              className="velzon-search-result flex w-full cursor-pointer flex-col items-start border-t border-[var(--theme-border)]/60 px-4 py-2.5 text-left text-sm transition hover:bg-indigo-50/80"
            >
              <span className="font-medium text-indigo-700">Ask AI</span>
              <span className="text-xs opacity-70">{askAiMessage}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
