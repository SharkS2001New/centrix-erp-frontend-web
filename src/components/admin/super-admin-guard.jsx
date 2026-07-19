"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";

export function SuperAdminGuard({ children }) {
  const { loading, isSuperAdmin, loginChannel, switchWorkspace } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isSuperAdmin()) {
      router.replace("/dashboard");
    }
  }, [isSuperAdmin, loading, router]);

  // Platform APIs reject POS-channel tokens. Restore backoffice if this session
  // was switched to POS while testing the cashier terminal.
  useEffect(() => {
    if (loading || !isSuperAdmin()) return;
    if (loginChannel !== POS_LOGIN_CHANNEL) return;
    switchWorkspace("backoffice").catch((err) => {
      console.error("Failed to restore platform session channel", err);
    });
  }, [isSuperAdmin, loading, loginChannel, switchWorkspace]);

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
