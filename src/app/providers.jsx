"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { PosSessionProvider } from "@/contexts/pos-session-context";

export function Providers({ children }) {
  return (
    <AuthProvider>
      <PosSessionProvider>{children}</PosSessionProvider>
    </AuthProvider>
  );
}
