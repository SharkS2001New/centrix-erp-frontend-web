"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export function SuperAdminGuard({ children }) {
  const { user, capabilities, loading, isSuperAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isSuperAdmin()) {
      router.replace("/dashboard");
    }
  }, [isSuperAdmin, loading, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isSuperAdmin()) return null;

  return <>{children}</>;
}
