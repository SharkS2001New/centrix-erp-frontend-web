"use client";

import { createContext, useContext, useMemo } from "react";

const SettingsApiContext = createContext({
  settingsPath: (section) => `/erp/settings/${section}`,
});

/** @param {{ apiPrefix?: string, children: import("react").ReactNode }} props */
export function SettingsApiProvider({ apiPrefix = "/erp/settings", children }) {
  const value = useMemo(
    () => ({
      settingsPath: (section) => `${apiPrefix}/${section}`,
    }),
    [apiPrefix],
  );

  return <SettingsApiContext.Provider value={value}>{children}</SettingsApiContext.Provider>;
}

export function useSettingsApi() {
  return useContext(SettingsApiContext);
}
