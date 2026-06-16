"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import {
  applyTheme,
  getTheme,
  readStoredTheme,
  subscribeTheme,
  toggleTheme as toggleThemeStore,
} from "@/lib/theme";

const ThemeContext = createContext(null);

/** Apply saved theme as soon as this client bundle loads (no <script> in React tree). */
if (typeof window !== "undefined") {
  applyTheme(readStoredTheme());
}

export function ThemeProvider({ children }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");

  useLayoutEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: applyTheme,
      toggleTheme: toggleThemeStore,
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
