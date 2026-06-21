"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import { P } from "@/lib/permission-codes";

export function PosAuthGuard({ children }) {
  const { loading, hasPermission } = useAuth();
  const router = useRouter();
  const allowed = hasPermission(P.pos.terminal.view);

  useEffect(() => {
    if (!loading && !hasAuthSession()) {
      router.replace("/login");
      return;
    }
    if (!loading && hasAuthSession() && !allowed) {
      router.replace("/profile");
    }
  }, [allowed, loading, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 text-slate-600">
        Loading…
      </div>
    );
  }

  if (!hasAuthSession() || !allowed) return null;

  return <>{children}</>;
}
