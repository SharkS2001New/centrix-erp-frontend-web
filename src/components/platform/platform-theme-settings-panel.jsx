"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { ClassicPosThemePicker } from "@/components/admin/external-pos-platform-fields";
import {
  CLASSIC_POS_THEME_DEFAULT,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import { notifyError, notifySuccess } from "@/lib/notify";

/**
 * Centrix ERP theme for the PLATFORM shell organization (platform admin UI).
 */
export function PlatformThemeSettingsPanel() {
  const { refreshCapabilities } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [themeTemplate, setThemeTemplate] = useState(CLASSIC_POS_THEME_DEFAULT);
  const [themeColors, setThemeColors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-theme");
      setThemeTemplate(normalizeClassicPosThemeTemplate(res.classic_pos_theme_template));
      setThemeColors(normalizeClassicPosThemeColors(res.classic_pos_theme_colors));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load platform theme.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const themeId = normalizeClassicPosThemeTemplate(themeTemplate);
      const colors = normalizeClassicPosThemeColors(themeColors);
      const res = await apiRequest("/admin/platform-theme", {
        method: "PATCH",
        body: {
          classic_pos_theme_template: themeId,
          classic_pos_theme_colors: colors,
        },
      });
      setThemeTemplate(normalizeClassicPosThemeTemplate(res.classic_pos_theme_template));
      setThemeColors(normalizeClassicPosThemeColors(res.classic_pos_theme_colors));
      await refreshCapabilities?.({ force: true });
      notifySuccess(res.message || "Platform theme saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save platform theme.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Platform appearance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Color palette for the platform admin shell (your PLATFORM organization account). Does not
          change tenant organization themes — set those under each organization.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-6">
            <ClassicPosThemePicker
              value={themeTemplate}
              onChange={setThemeTemplate}
              colors={themeColors}
              onColorsChange={setThemeColors}
              description="Applies to Platform → sidebar background and primary buttons only (and Classic POS if you open it). Default is Centrix (original)."
            />
            <div className="pt-2">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save platform theme"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </section>
    </form>
  );
}
