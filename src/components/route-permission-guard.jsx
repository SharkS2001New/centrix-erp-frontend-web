"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveHomePath } from "@/lib/access-control";
import { canAccessRoute } from "@/lib/route-access";

export function RoutePermissionGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, hasPermission, isModuleEnabled, isSuperAdmin } =
    useAuth();
  const requireTillFloat = Boolean(capabilities?.require_till_float);

  const accessCtx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        requireTillFloat,
        isSuperAdmin,
      }),
    [capabilities, isSuperAdmin, organization, requireTillFloat, user],
  );

  const allowed = canAccessRoute(pathname, accessCtx);
  const homePath = useMemo(() => resolveHomePath(accessCtx), [accessCtx]);
  const fallbackPath = useMemo(() => {
    if (canAccessRoute(homePath, accessCtx)) return homePath;
    if (canAccessRoute("/profile", accessCtx)) return "/profile";
    return "/choose-workspace";
  }, [accessCtx, homePath]);

  useEffect(() => {
    if (!loading && !allowed && pathname !== fallbackPath) {
      router.replace(fallbackPath);
    }
  }, [allowed, fallbackPath, loading, pathname, router]);

  if (loading) return null;
  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
