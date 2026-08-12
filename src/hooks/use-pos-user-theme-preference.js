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

  const savePreference = useCallback(
    (next) => {
      if (next == null || next.useOrgDefault) {
        clearPosUserThemePreference(userId, organizationId);
        return;
      }
      writePosUserThemePreference(userId, organizationId, {
        template: next.template,
        colors: next.colors,
      });
    },
    [userId, organizationId],
  );

  const useOrgDefault = useCallback(() => {
    clearPosUserThemePreference(userId, organizationId);
  }, [userId, organizationId]);

  return {
    preference,
    savePreference,
    useOrgDefault,
    hasOverride: Boolean(preference && !preference.useOrgDefault && preference.template),
  };
}
