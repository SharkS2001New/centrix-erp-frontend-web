"use client";

import { useLayoutEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { applyTheme, getTheme } from "@/lib/theme";
import {
  applyClassicPosDocumentTheme,
  clearClassicPosDocumentTheme,
  isDarkClassicPosTheme,
  resolveClassicPosThemeColors,
  resolveClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";

/**
 * Applies the organization-chosen Centrix ERP theme (sales.classic_pos_theme_*)
 * across the whole app — not only Classic External POS.
 */
export function OrgThemeBridge({ children }) {
  const { capabilities, user } = useAuth();

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

    const previous = getTheme();
    const dark = isDarkClassicPosTheme(template);

    applyClassicPosDocumentTheme(template, colors);
    if (dark) {
      applyTheme("dark");
    }

    return () => {
      if (dark) applyTheme(previous);
    };
  }, [user, template, colors]);

  return children;
}
