"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";

export function AuthGuard({ children }) {
  const { loading, user } = useAuth();
  const router = useRouter();
  const sessionReady = Boolean(user) || hasAuthSession();

  useEffect(() => {
    if (!loading && !hasAuthSession()) {
      router.replace("/login");
    }
  }, [loading, router]);

  if (loading && !sessionReady) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-300">
        Loading…
      </div>
    );
  }

  if (!hasAuthSession()) return null;

  return <>{children}</>;
}
