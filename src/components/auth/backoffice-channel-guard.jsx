"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { POS_HOME_PATH } from "@/lib/login-channels";

export function BackofficeChannelGuard({ children }) {
  const { loading, isPosSession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isPosSession()) {
      router.replace(POS_HOME_PATH);
    }
  }, [loading, isPosSession, router]);

  if (loading) return null;
  if (isPosSession()) return null;

  return <>{children}</>;
}
