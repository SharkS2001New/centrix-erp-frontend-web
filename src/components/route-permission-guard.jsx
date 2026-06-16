"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { canAccessRoute } from "@/lib/route-access";

export function RoutePermissionGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, hasPermission, isModuleEnabled, isSuperAdmin } = useAuth();
  const requireTillFloat = Boolean(capabilities?.require_till_float);

  const allowed = canAccessRoute(pathname, {
    user,
    organization,
    capabilities,
    hasPermission,
    isModuleEnabled,
    requireTillFloat,
    isSuperAdmin,
  });

  useEffect(() => {
    if (!loading && !allowed) {
      router.replace("/dashboard");
    }
  }, [allowed, loading, router]);

  if (loading) return null;
  if (!allowed) return null;

  return <>{children}</>;
}
