"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";

export function AuthGuard({ children }) {
  const { loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !hasAuthSession()) {
      router.replace("/login");
    }
  }, [loading, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-300">
        Loading…
      </div>
    );
  }

  if (!hasAuthSession()) return null;

  return <>{children}</>;
}
