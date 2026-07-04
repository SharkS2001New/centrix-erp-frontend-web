"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { resolveNotificationLinkAccess } from "@/lib/notification-action-url";

/**
 * @param {{
 *   actionUrl?: string | null,
 *   label?: string,
 *   className?: string,
 *   disabledClassName?: string,
 *   onBlocked?: (message: string) => void,
 * }} props
 */
export function NotificationActionLink({
  actionUrl,
  label = "Open related screen",
  className = "text-xs font-medium text-[#185FA5] hover:underline",
  disabledClassName = "text-xs font-medium text-slate-400 cursor-not-allowed",
  onBlocked,
}) {
  const { capabilities, user, organization, isSuperAdmin } = useAuth();

  const access = useMemo(() => {
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });
    return resolveNotificationLinkAccess(actionUrl, {
      capabilities,
      ctx,
      storedWorkspaceId: getStoredWorkspace(),
    });
  }, [actionUrl, capabilities, isSuperAdmin, organization, user]);

  if (!access.normalizedUrl) return null;

  if (!access.canOpen) {
    return (
      <div className="space-y-1">
        <span className={disabledClassName} aria-disabled="true">
          {label}
        </span>
        {access.message ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">{access.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      href={access.normalizedUrl}
      className={className}
      onClick={(event) => {
        if (!access.canOpen) {
          event.preventDefault();
          onBlocked?.(access.message ?? "This screen is not available in your current module.");
        }
      }}
    >
      {label}
    </Link>
  );
}

/**
 * @param {string | null | undefined} actionUrl
 * @param {object} authSlice — { capabilities, user, organization, isSuperAdmin }
 */
export function useNotificationLinkAccess(actionUrl, authSlice) {
  const { capabilities, user, organization, isSuperAdmin } = authSlice;

  return useMemo(() => {
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });
    return resolveNotificationLinkAccess(actionUrl, {
      capabilities,
      ctx,
      storedWorkspaceId: getStoredWorkspace(),
    });
  }, [actionUrl, capabilities, isSuperAdmin, organization, user]);
}
