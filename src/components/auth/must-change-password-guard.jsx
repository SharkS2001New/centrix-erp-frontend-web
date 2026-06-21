"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";

export function MustChangePasswordGuard({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !hasAuthSession()) return;
    if (user?.must_change_password && pathname !== "/change-password") {
      router.replace("/change-password");
    }
  }, [loading, pathname, router, user?.must_change_password]);

  if (!loading && user?.must_change_password && pathname !== "/change-password") {
    return null;
  }

  return children;
}
