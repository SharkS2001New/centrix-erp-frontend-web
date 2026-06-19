"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { LockScreenProvider } from "@/contexts/lock-screen-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { PosSessionProvider } from "@/contexts/pos-session-context";

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LockScreenProvider>
          <PosSessionProvider>{children}</PosSessionProvider>
        </LockScreenProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
