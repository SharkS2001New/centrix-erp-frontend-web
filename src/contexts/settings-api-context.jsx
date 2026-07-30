"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";

const SettingsApiContext = createContext({
  settingsPath: (section) => `/erp/settings/${section}`,
  organizationApiPath: (path) => path,
  isOrganizationScoped: false,
});

/** @param {{ apiPrefix?: string, children: import("react").ReactNode }} props */
export function SettingsApiProvider({ apiPrefix = "/erp/settings", children }) {
  const orgScopedPrefix = /^\/admin\/organizations\/\d+\/settings$/.test(apiPrefix)
    ? apiPrefix.replace(/\/settings$/, "")
    : null;

  const value = useMemo(
    () => ({
      settingsPath: (section) => `${apiPrefix}/${section}`,
      organizationApiPath: (path) => {
        const normalized = path.startsWith("/") ? path : `/${path}`;
        return orgScopedPrefix ? `${orgScopedPrefix}${normalized}` : normalized;
      },
      isOrganizationScoped: Boolean(orgScopedPrefix),
    }),
    [apiPrefix, orgScopedPrefix],
  );

  return <SettingsApiContext.Provider value={value}>{children}</SettingsApiContext.Provider>;
}

export function useSettingsApi() {
  return useContext(SettingsApiContext);
}

/** After settings save: refresh session capabilities so nav/features update without a browser reload. */
export function useSettingsAfterSave(onAfterSave) {
  const { refreshCapabilities } = useAuth();

  return useCallback(async () => {
    // Force-refresh so module_settings toggles apply instantly across the app.
    const caps = await refreshCapabilities({ force: true });
    if (onAfterSave) {
      await onAfterSave();
    }
    return caps;
  }, [onAfterSave, refreshCapabilities]);
}
