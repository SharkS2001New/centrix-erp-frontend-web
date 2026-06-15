"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

export function AdminGuard({ children }) {
  const { user, capabilities, loading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.is_admin || capabilities?.is_admin;

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [loading, isAdmin, router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
