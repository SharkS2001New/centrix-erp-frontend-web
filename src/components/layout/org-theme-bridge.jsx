"use client";

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  applyOrgErpSidebarTheme,
  clearClassicPosDocumentTheme,
  resolveErpThemeColors,
  resolveErpThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { applyOrgPrimaryTheme, normalizeOrgPrimaryColor } from "@/lib/org-brand-theme";
import { getTheme, subscribeTheme } from "@/lib/theme";

/**
 * Applies organization brand (primary) + Centrix ERP sidebar/button theme for backoffice modules.
 * External POS uses its own theme palette while the cashier desk is open.
 */
export function OrgThemeBridge({ children }) {
  const { capabilities, user, organization } = useAuth();
  const colorMode = useSyncExternalStore(subscribeTheme, getTheme, () => "light");

  const template = useMemo(
    () => resolveErpThemeTemplate(capabilities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      capabilities?.module_settings?.sales?.erp_theme_template,
      capabilities?.module_settings?.sales?.classic_pos_theme_template,
    ],
  );

  const colorsKey = JSON.stringify({
    erp: capabilities?.module_settings?.sales?.erp_theme_colors ?? null,
    legacy: capabilities?.module_settings?.sales?.classic_pos_theme_colors ?? {},
  });
  const colors = useMemo(
    () => resolveErpThemeColors(capabilities),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorsKey],
  );

  const orgPrimary = normalizeOrgPrimaryColor(organization?.primary_color);

  useLayoutEffect(() => {
    if (!user) {
      clearClassicPosDocumentTheme();
      return undefined;
    }

    // External POS owns the full document palette while the cashier desk is open.
    if (typeof document !== "undefined" && document.documentElement.dataset.classicPosActive === "true") {
      return undefined;
    }

    applyOrgErpSidebarTheme(template, colors, { mode: colorMode });
    // Org brand primary wins for ERP chrome when set (Admin → Company).
    if (orgPrimary) {
      applyOrgPrimaryTheme(orgPrimary, { mode: colorMode });
    }
    return undefined;
  }, [user, template, colors, colorMode, orgPrimary]);

  return children;
}
