"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { PosSessionProvider } from "@/contexts/pos-session-context";

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PosSessionProvider>{children}</PosSessionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
