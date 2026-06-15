"use client";

import { useSyncExternalStore } from "react";
import { getTheme, subscribeTheme, toggleTheme } from "@/lib/theme";

export function ThemeToggle({ className = "" }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "dark");
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className={`theme-toggle-btn inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${className}`}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      suppressHydrationWarning
    >
      <span aria-hidden suppressHydrationWarning>{isDark ? "☀️" : "🌙"}</span>
      <span suppressHydrationWarning>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
