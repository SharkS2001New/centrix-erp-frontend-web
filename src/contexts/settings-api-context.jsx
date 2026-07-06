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

/** Prefer org reload on platform-managed settings; otherwise refresh tenant capabilities. */
export function useSettingsAfterSave(onAfterSave) {
  const { isOrganizationScoped } = useSettingsApi();
  const { refreshCapabilities } = useAuth();

  return useCallback(async () => {
    if (onAfterSave) {
      await onAfterSave();
      return;
    }
    if (!isOrganizationScoped) {
      await refreshCapabilities({ force: true });
    }
  }, [isOrganizationScoped, onAfterSave, refreshCapabilities]);
}
