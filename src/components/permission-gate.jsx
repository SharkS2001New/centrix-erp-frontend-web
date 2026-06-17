"use client";

import { useAuth } from "@/contexts/auth-context";

/**
 * Renders children only when the user has the required permission and/or module.
 */
export function PermissionGate({ permission, module, children, fallback = null }) {
  const { hasPermission, isModuleEnabled } = useAuth();

  if (module && !isModuleEnabled(module)) {
    return fallback;
  }
  if (permission && !hasPermission(permission)) {
    return fallback;
  }

  return children;
}

export function useCanAccess({ permission, module } = {}) {
  const { hasPermission, isModuleEnabled } = useAuth();
  if (module && !isModuleEnabled(module)) return false;
  if (permission && !hasPermission(permission)) return false;
  return true;
}
