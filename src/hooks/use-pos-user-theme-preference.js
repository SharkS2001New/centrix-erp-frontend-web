"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  clearPosUserThemePreference,
  readPosUserThemePreference,
  subscribePosUserThemePreference,
  writePosUserThemePreference,
} from "@/lib/pos-user-theme-preference";

function snapshot(userId, organizationId) {
  return readPosUserThemePreference(userId, organizationId);
}

export function usePosUserThemePreference(userId, organizationId) {
  const preference = useSyncExternalStore(
    subscribePosUserThemePreference,
    () => snapshot(userId, organizationId),
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
