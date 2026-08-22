"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { resolveTillFloatNavFlag } from "@/lib/access-control";
import { searchAdminSettings } from "@/lib/admin-settings-catalog";
import { useAppRouter } from "@/lib/use-app-router";

function SearchIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3-3" />
    </svg>
  );
}

/**
 * Smart settings finder for Admin home — search a setting name and jump to its page/tab.
 */
export function AdminSettingsSearch() {
  const router = useAppRouter();
  const { hasPermission, isModuleEnabled, isSuperAdmin, organization, user, capabilities } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef(null);

  const navContext = useMemo(
    () => ({
      hasPermission,
      isModuleEnabled,
      isSuperAdmin,
      organization,
      user,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
    }),
    [capabilities, hasPermission, isModuleEnabled, isSuperAdmin, organization, user],
  );

  const results = useMemo(
    () =>
      searchAdminSettings(query, {
        capabilities,
        hasPermission,
        navContext,
        limit: 10,
      }),
    [capabilities, hasPermission, navContext, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results]);

  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
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
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]?.href) {
      e.preventDefault();
      goTo(results[activeIndex].href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const trimmed = query.trim();
  const showDropdown = open && trimmed.length > 0;

  return (
    <div ref={containerRef} className="relative mb-5 max-w-2xl">
      <label htmlFor="admin-settings-search" className="sr-only">
        Find a setting
      </label>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id="admin-settings-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => trimmed && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Find a setting… e.g. KRA, credit sales, SMS, till float"
        className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] py-2.5 pl-9 pr-3 text-sm outline-none ring-[var(--theme-primary)] focus:ring-2"
        aria-expanded={open}
        aria-controls="admin-settings-search-listbox"
        aria-autocomplete="list"
        role="combobox"
      />

      {showDropdown ? (
        <div
          id="admin-settings-search-listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-80 overflow-y-auto rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-lg"
          role="listbox"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No settings match “{trimmed}”.</p>
          ) : (
            <ul className="py-1">
              {results.map((entry, index) => {
                const active = index === activeIndex;
                return (
                  <li key={entry.id} role="option" aria-selected={active}>
                    <AppNavLink
                      href={entry.href}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`block px-4 py-2.5 no-underline transition ${
                        active ? "bg-[#E6F1FB]" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="block text-sm font-medium text-slate-900">{entry.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{entry.path}</span>
                      {entry.description ? (
                        <span className="mt-0.5 block text-xs text-slate-400">{entry.description}</span>
                      ) : null}
                    </AppNavLink>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
