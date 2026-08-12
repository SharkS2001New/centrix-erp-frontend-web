"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  clearPosUserThemePreference,
  getPosUserThemePreferenceSnapshot,
  subscribePosUserThemePreference,
  writePosUserThemePreference,
} from "@/lib/pos-user-theme-preference";

export function usePosUserThemePreference(userId, organizationId) {
  const preference = useSyncExternalStore(
    subscribePosUserThemePreference,
    () => getPosUserThemePreferenceSnapshot(userId, organizationId),
    () => null,
  );

  const setTemplate = useCallback(
    (template) => {
      if (template == null) {
        clearPosUserThemePreference(userId, organizationId);
        return;
      }
      writePosUserThemePreference(userId, organizationId, { template });
    },
    [userId, organizationId],
  );

  const useOrgDefault = useCallback(() => {
    clearPosUserThemePreference(userId, organizationId);
  }, [userId, organizationId]);

  return {
    preference,
    setTemplate,
    useOrgDefault,
    hasOverride: Boolean(preference && !preference.useOrgDefault && preference.template),
  };
}
