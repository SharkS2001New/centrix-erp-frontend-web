"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export function AdminGuard({ children, strict = false }) {
  const { user, capabilities, loading, hasPermission } = useAuth();
  const router = useRouter();
  const isAdmin = user?.is_admin || capabilities?.is_admin;
  const canAccess = strict
    ? isAdmin
    : isAdmin || hasPermission("admin.overview.view") || hasPermission("admin.manage");

  useEffect(() => {
    if (!loading && !canAccess) {
      router.replace("/dashboard");
    }
  }, [canAccess, loading, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!canAccess) return null;

  return <>{children}</>;
}
