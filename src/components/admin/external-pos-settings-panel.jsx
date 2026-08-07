"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CLASSIC_POS_THEME_DEFAULT,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import {
  ClassicPosThemePicker,
  ExternalPosPlatformFields,
} from "@/components/admin/external-pos-platform-fields";
import { resolveExternalPosLayout } from "@/lib/external-pos-layout";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

function platformExternalPosFromApi(res) {
  const sales = res?.sales ?? res ?? {};
  return {
    external_pos_layout: sales.external_pos_layout === "classic" ? "classic" : "modern",
    classic_pos_theme_template: normalizeClassicPosThemeTemplate(sales.classic_pos_theme_template),
    classic_pos_theme_colors: normalizeClassicPosThemeColors(sales.classic_pos_theme_colors),
    show_pos_checkout_on_create: sales.show_pos_checkout_on_create !== false,
    require_pos_till_float: Boolean(sales.require_pos_till_float),
    enable_pos_cash_rounding: Boolean(sales.enable_pos_cash_rounding),
    receipt_show_all_payment_methods: sales.receipt_show_all_payment_methods !== false,
    enable_pos_order_edit: Boolean(sales.enable_pos_order_edit),
    enable_held_order_amount_paid: Boolean(sales.enable_held_order_amount_paid),
    pos_combine_identical_lines: sales.pos_combine_identical_lines !== false,
  };
}

export function ExternalPosSettingsPanel({
  capabilities,
  saving,
  setSaving,
  setError,
  setMessage,
  onAfterSave,
  platformManaged = false,
}) {
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const [platformForm, setPlatformForm] = useState(() => platformExternalPosFromApi({}));
  const [themeTemplate, setThemeTemplate] = useState(CLASSIC_POS_THEME_DEFAULT);
  const [themeColors, setThemeColors] = useState({});
  const [loading, setLoading] = useState(true);

  const modules = capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const isHospitality =
    capabilities?.industry === "hospitality" ||
    capabilities?.deployment_profile === "hotel_bar";
  const layoutFromCaps = resolveExternalPosLayout(capabilities);
  const layout = platformManaged
    ? platformForm.external_pos_layout === "classic"
      ? "classic"
      : "modern"
    : layoutFromCaps;
  const isClassic = layout === "classic";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const salesRes = await apiRequest(settingsPath("sales"));
      const fromApi = platformExternalPosFromApi(salesRes);
      setPlatformForm(fromApi);
      setThemeTemplate(fromApi.classic_pos_theme_template);
      setThemeColors(fromApi.classic_pos_theme_colors);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load Centrix ERP Themes");
    } finally {
      setLoading(false);
    }
  }, [setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const themeId = normalizeClassicPosThemeTemplate(
        platformManaged ? platformForm.classic_pos_theme_template : themeTemplate,
      );
      const colors = normalizeClassicPosThemeColors(
        platformManaged ? platformForm.classic_pos_theme_colors : themeColors,
      );
      const body = {
        classic_pos_theme_template: themeId,
        classic_pos_theme_colors: colors,
        ...(platformManaged
          ? {
              external_pos_layout: platformForm.external_pos_layout,
              classic_pos_theme_template: normalizeClassicPosThemeTemplate(
                platformForm.classic_pos_theme_template,
              ),
              classic_pos_theme_colors: normalizeClassicPosThemeColors(
                platformForm.classic_pos_theme_colors,
              ),
              show_checkout_on_create_order: Boolean(platformForm.show_pos_checkout_on_create),
              require_pos_till_float: Boolean(platformForm.require_pos_till_float),
              enable_pos_cash_rounding: Boolean(platformForm.enable_pos_cash_rounding),
              receipt_show_all_payment_methods: Boolean(
                platformForm.receipt_show_all_payment_methods,
              ),
              enable_pos_order_edit: Boolean(platformForm.enable_pos_order_edit),
              enable_held_order_amount_paid: Boolean(
                platformForm.enable_held_order_amount_paid,
              ),
              pos_combine_identical_lines: Boolean(platformForm.pos_combine_identical_lines),
            }
          : {}),
      };
      await apiRequest(settingsPath("sales"), { method: "PATCH", body });
      await afterSave?.();
      const salesRes = await apiRequest(settingsPath("sales"));
      const fromApi = platformExternalPosFromApi(salesRes);
      setPlatformForm(fromApi);
      setThemeTemplate(fromApi.classic_pos_theme_template);
      setThemeColors(fromApi.classic_pos_theme_colors);
      setMessage("Centrix ERP Themes saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save Centrix ERP Themes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Centrix ERP Themes</h2>
        <p className="mt-1 text-sm text-slate-500">
          {isHospitality ? (
            <>
              Color palette for Centrix ERP Themes. Hotel Backoffice and Admin change the{" "}
              <strong>sidebar background</strong> and <strong>primary button colors</strong>. Default
              is Centrix.
            </>
          ) : (
            <>
              Color palette for Centrix ERP Themes. Backoffice and other modules only change the{" "}
              <strong>sidebar background</strong> and <strong>primary button colors</strong>. Classic
              External POS still uses the full palette (workspace, footer, dialogs). Default is Centrix.
              {hasPosSales
                ? " Till close, barcode scanner, and POS customer prompts are under Organization settings → Sales → Tills."
                : ""}
            </>
          )}
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-6">
            {platformManaged ? (
              <ExternalPosPlatformFields
                value={platformForm}
                onChange={(next) => {
                  setPlatformForm(next);
                  if (next?.classic_pos_theme_template) {
                    setThemeTemplate(normalizeClassicPosThemeTemplate(next.classic_pos_theme_template));
                  }
                  if (next?.classic_pos_theme_colors != null) {
                    setThemeColors(normalizeClassicPosThemeColors(next.classic_pos_theme_colors));
                  }
                }}
                posEnabled={hasPosSales}
                showTheme
                showLayout={hasPosSales}
                showBehaviourToggles={hasPosSales}
              />
            ) : (
              <>
                {hasPosSales ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">POS layout</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Current layout:{" "}
                      <span className="font-medium">{isClassic ? "Classic" : "Modern"}</span>
                      . Theme colors below tint the ERP sidebar and primary buttons
                      {isClassic
                        ? "; Classic External POS still uses the full palette"
                        : ""}
                      . Layout is set by the platform.
                    </p>
                  </div>
                ) : null}
                <ClassicPosThemePicker
                  value={themeTemplate}
                  onChange={setThemeTemplate}
                  colors={themeColors}
                  onColorsChange={setThemeColors}
                />
              </>
            )}

            <div className="pt-2">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Centrix ERP Themes"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </section>
    </form>
  );
}
