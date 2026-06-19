"use client";

import { useSyncExternalStore } from "react";
import { getTheme, subscribeTheme, toggleTheme } from "@/lib/theme";

function SunIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );
}

export function ThemeToggle({ className = "", compact = false, showLabel = false }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "dark");
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className={`theme-toggle-btn inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition ${className}`}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      suppressHydrationWarning
    >
      {isDark ? <SunIcon className="h-4 w-4 shrink-0" /> : <MoonIcon className="h-4 w-4 shrink-0" />}
      {!compact ? (
        <span
          suppressHydrationWarning
          className={showLabel ? "inline whitespace-nowrap" : "hidden lg:inline"}
        >
          {isDark ? "Light" : "Dark"}
        </span>
      ) : null}
    </button>
  );
}
