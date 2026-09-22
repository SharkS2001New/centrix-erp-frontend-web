"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveHomePath, resolveTillFloatNavFlag } from "@/lib/access-control";
import { canAccessRoute } from "@/lib/route-access";
import { readCachedAuthSnapshot } from "@/lib/auth-storage";
import { notifyError } from "@/lib/notify";
import { finishNavigation } from "@/lib/app-loading";

export function RoutePermissionGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, isSuperAdmin, loading } = useAuth();
  const cached = readCachedAuthSnapshot();
  const effectiveUser = user ?? cached?.user ?? null;
  const effectiveOrganization = organization ?? cached?.organization ?? null;
  const effectiveCapabilities = capabilities ?? cached?.capabilities ?? null;
  const requireTillFloat = resolveTillFloatNavFlag(effectiveCapabilities);
  const notifiedPathRef = useRef(null);

  const accessCtx = useMemo(
    () =>
      buildAccessContext({
        user: effectiveUser,
        organization: effectiveOrganization,
        capabilities: effectiveCapabilities,
        requireTillFloat,
        isSuperAdmin,
      }),
    [effectiveCapabilities, effectiveOrganization, effectiveUser, isSuperAdmin, requireTillFloat],
  );

  const allowed = canAccessRoute(pathname, accessCtx);
  const homePath = useMemo(() => resolveHomePath(accessCtx), [accessCtx]);
  const fallbackPath = useMemo(() => {
    if (canAccessRoute(homePath, accessCtx)) return homePath;
    if (canAccessRoute("/choose-workspace", accessCtx)) return "/choose-workspace";
    if (canAccessRoute("/profile", accessCtx)) return "/profile";
    return "/choose-workspace";
  }, [accessCtx, homePath]);

  // Permissions are known once capabilities (or a cached snapshot) are present.
  const permissionsReady = Boolean(effectiveCapabilities) && !loading;

  useEffect(() => {
    if (allowed) {
      notifiedPathRef.current = null;
      return;
    }
    if (!permissionsReady || pathname === fallbackPath) return;

    if (notifiedPathRef.current !== pathname) {
      notifiedPathRef.current = pathname;
      notifyError("You do not have permission to open this page.");
      finishNavigation();
    }
    router.replace(fallbackPath);
  }, [allowed, fallbackPath, pathname, permissionsReady, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {permissionsReady ? "You do not have permission to open this page." : "Checking access…"}
      </div>
    );
  }

  return <>{children}</>;
}
