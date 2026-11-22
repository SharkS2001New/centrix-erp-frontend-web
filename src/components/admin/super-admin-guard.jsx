"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getStoredLoginChannel } from "@/lib/auth-storage";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";

export function SuperAdminGuard({ children }) {
  const { loading, isSuperAdmin, loginChannel, switchWorkspace } = useAuth();
  const router = useRouter();
  const [restoreError, setRestoreError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const superAdmin = isSuperAdmin();
  const needsBackofficeChannel =
    loginChannel === POS_LOGIN_CHANNEL || getStoredLoginChannel() === POS_LOGIN_CHANNEL;

  useEffect(() => {
    if (!loading && !superAdmin) {
      router.replace("/dashboard");
    }
  }, [loading, router, superAdmin]);

  // Keep platform pages from issuing requests until the POS session is restored.
  useEffect(() => {
    if (loading || !superAdmin || !needsBackofficeChannel) {
      setRestoreError(null);
      return;
    }

    let cancelled = false;
    setRestoreError(null);
    switchWorkspace("backoffice").catch((err) => {
      console.error("Failed to restore platform session channel", err);
      if (!cancelled) {
        setRestoreError(
          err instanceof Error ? err.message : "Could not restore the platform session.",
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loading, needsBackofficeChannel, retryToken, superAdmin, switchWorkspace]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!superAdmin) return null;

  if (needsBackofficeChannel) {
    if (restoreError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-600">
          <p>{restoreError}</p>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => {
              setRestoreError(null);
              setRetryToken((token) => token + 1);
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Restoring platform session…
      </div>
    );
  }

  return <>{children}</>;
}
