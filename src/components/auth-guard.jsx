"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";

function AuthGuardPlaceholder() {
  return (
    <div className="app-shell-bg flex h-screen overflow-hidden" aria-busy="true" aria-live="polite">
      <div className="flex flex-1 items-center justify-center">
        <p className="theme-subtext text-sm">Loading…</p>
      </div>
    </div>
  );
}

export function AuthGuard({ children }) {
  const [ready, setReady] = useState(false);
  const { loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || loading) return;
    if (!hasAuthSession()) {
      router.replace("/login");
    }
  }, [ready, loading, router]);

  if (!ready) {
    return <AuthGuardPlaceholder />;
  }

  const sessionReady = Boolean(user) || hasAuthSession();

  if (loading && !sessionReady) {
    return <AuthGuardPlaceholder />;
  }

  if (!hasAuthSession()) {
    return null;
  }

  return <>{children}</>;
}
