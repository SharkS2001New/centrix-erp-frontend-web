"use client";

import { AuthProvider } from "@/contexts/auth-context";

export function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
