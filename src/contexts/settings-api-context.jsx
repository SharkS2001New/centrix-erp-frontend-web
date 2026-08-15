"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { invalidateAllTabAwareDataLoads } from "@/contexts/tab-pane-activity-context";

const SettingsApiContext = createContext({
  settingsPath: (section) => `/erp/settings/${section}`,
  organizationApiPath: (path) => path,
  isOrganizationScoped: false,
  bumpSettingsSaveGen: () => {},
  settingsSaveGenRef: { current: 0 },
});

/** @param {{ apiPrefix?: string, children: import("react").ReactNode }} props */
export function SettingsApiProvider({ apiPrefix = "/erp/settings", children }) {
  const orgScopedPrefix = /^\/admin\/organizations\/\d+\/settings$/.test(apiPrefix)
    ? apiPrefix.replace(/\/settings$/, "")
    : null;
  const settingsSaveGenRef = useRef(0);

  const bumpSettingsSaveGen = useCallback(() => {
    settingsSaveGenRef.current += 1;
  }, []);

  const value = useMemo(
    () => ({
      settingsPath: (section) => `${apiPrefix}/${section}`,
      organizationApiPath: (path) => {
        const normalized = path.startsWith("/") ? path : `/${path}`;
        return orgScopedPrefix ? `${orgScopedPrefix}${normalized}` : normalized;
      },
      isOrganizationScoped: Boolean(orgScopedPrefix),
      bumpSettingsSaveGen,
      settingsSaveGenRef,
    }),
    [apiPrefix, bumpSettingsSaveGen, orgScopedPrefix],
  );

  return <SettingsApiContext.Provider value={value}>{children}</SettingsApiContext.Provider>;
}

export function useSettingsApi() {
  return useContext(SettingsApiContext);
}

/**
 * GET a settings section, ignoring the result if Save already completed
 * (prevents a late load from snapping toggles back to the previous value).
 */
export function useSettingsGet() {
  const { settingsPath, settingsSaveGenRef } = useSettingsApi();

  return useCallback(
    async (section, options = {}) => {
      const started = settingsSaveGenRef?.current ?? 0;
      const res = await apiRequest(settingsPath(section), {
        cache: "no-store",
        dedupe: false,
        ...options,
      });
      if ((settingsSaveGenRef?.current ?? 0) !== started) return null;
      return res;
    },
    [settingsPath, settingsSaveGenRef],
  );
}

/** After settings save: refresh session capabilities so nav/features update without a browser reload. */
export function useSettingsAfterSave(onAfterSave) {
  const { refreshCapabilities } = useAuth();
  const { bumpSettingsSaveGen } = useSettingsApi();

  return useCallback(async () => {
    bumpSettingsSaveGen?.();
    // Force-refresh so module_settings toggles apply instantly across the app.
    const caps = await refreshCapabilities({ force: true });
    invalidateAllTabAwareDataLoads();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("centrix:capabilities-refreshed"));
    }
    if (onAfterSave) {
      await onAfterSave();
    }
    return caps;
  }, [bumpSettingsSaveGen, onAfterSave, refreshCapabilities]);
}
