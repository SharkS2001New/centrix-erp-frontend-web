"use client";

import { createContext, useContext, useMemo } from "react";

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
