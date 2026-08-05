"use client";

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  applyOrgErpSidebarTheme,
  clearClassicPosDocumentTheme,
  resolveClassicPosThemeColors,
  resolveClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { getTheme, subscribeTheme } from "@/lib/theme";

/**
 * Applies the organization Centrix ERP theme to sidebar background + primary buttons.
 * Full workspace / panel / footer colors apply only inside Classic External POS.
 * Re-applies when light/dark mode changes so color themes never override dark mode surfaces.
 */
export function OrgThemeBridge({ children }) {
  const { capabilities, user } = useAuth();
  const colorMode = useSyncExternalStore(subscribeTheme, getTheme, () => "light");

  const template = useMemo(
    () => resolveClassicPosThemeTemplate(capabilities),
    // capabilities object identity changes often; key on the stored template id
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capabilities?.module_settings?.sales?.classic_pos_theme_template],
  );

  const colorsKey = JSON.stringify(
    capabilities?.module_settings?.sales?.classic_pos_theme_colors ?? {},
  );
  const colors = useMemo(
    () => resolveClassicPosThemeColors(capabilities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorsKey],
  );

  useLayoutEffect(() => {
    if (!user) {
      clearClassicPosDocumentTheme();
      return undefined;
    }

    // Classic External POS owns the full document palette while the cashier desk is open.
    if (typeof document !== "undefined" && document.documentElement.dataset.classicPosActive === "true") {
      return undefined;
    }

    applyOrgErpSidebarTheme(template, colors, { mode: colorMode });
    return undefined;
  }, [user, template, colors, colorMode]);

  return children;
}
