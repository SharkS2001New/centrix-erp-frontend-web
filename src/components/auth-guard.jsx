"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";

function AuthGuardPlaceholder({ message = "Loading…" }) {
  return (
    <div
      className="app-shell-bg flex h-screen overflow-hidden"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <div
          className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--brand-blue,#185FA5)]"
          aria-hidden
        />
        <p className="theme-subtext text-sm">{message}</p>
      </div>
    </div>
  );
}

export function AuthGuard({ children }) {
  const [ready, setReady] = useState(false);
  const { loading, user } = useAuth();
  const router = useRouter();
  const sessionPresent = hasAuthSession();

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || loading) return;
    if (!hasAuthSession()) {
      router.replace("/login");
    }
  }, [ready, loading, router, sessionPresent, user]);

  if (!ready) {
    return <AuthGuardPlaceholder />;
  }

  const sessionReady = Boolean(user) || hasAuthSession();

  if (loading && !sessionReady) {
    return <AuthGuardPlaceholder />;
  }

  if (!hasAuthSession()) {
    return <AuthGuardPlaceholder message="Signing out…" />;
  }

  return <>{children}</>;
}
