"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CLASSIC_POS_THEME_DEFAULT,
  normalizeClassicPosThemeColors,
  normalizeClassicPosThemeTemplate,
  resolveErpThemeColors,
  resolveErpThemeTemplate,
  resolveExternalPosThemeColors,
  resolveExternalPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import {
  CentrixSplitThemePickers,
  ExternalPosPlatformFields,
} from "@/components/admin/external-pos-platform-fields";
import { resolveExternalPosLayout } from "@/lib/external-pos-layout";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

function themesFromSales(sales = {}) {
  const bag = { module_settings: { sales } };
  return {
    erp_theme_template: resolveErpThemeTemplate(bag),
    erp_theme_colors: resolveErpThemeColors(bag),
    external_pos_theme_template: resolveExternalPosThemeTemplate(bag),
    external_pos_theme_colors: resolveExternalPosThemeColors(bag),
    classic_pos_theme_template: normalizeClassicPosThemeTemplate(sales.classic_pos_theme_template),
    classic_pos_theme_colors: normalizeClassicPosThemeColors(sales.classic_pos_theme_colors),
  };
}

function platformExternalPosFromApi(res) {
  const sales = res?.sales ?? res ?? {};
  const themes = themesFromSales(sales);
  return {
    external_pos_layout: sales.external_pos_layout === "classic" ? "classic" : "modern",
    ...themes,
    show_pos_checkout_on_create: sales.show_pos_checkout_on_create !== false,
    require_pos_till_float: Boolean(sales.require_pos_till_float),
    enable_pos_cash_rounding: Boolean(sales.enable_pos_cash_rounding),
    receipt_show_all_payment_methods: sales.receipt_show_all_payment_methods !== false,
    enable_pos_order_edit: Boolean(sales.enable_pos_order_edit),
    enable_held_order_amount_paid: Boolean(sales.enable_held_order_amount_paid),
    pos_combine_identical_lines: sales.pos_combine_identical_lines !== false,
  };
}

function buildThemeSaveBody({
  erpThemeTemplate,
  erpThemeColors,
  externalPosThemeTemplate,
  externalPosThemeColors,
}) {
  const erpTemplate = normalizeClassicPosThemeTemplate(erpThemeTemplate);
  const erpColors = normalizeClassicPosThemeColors(erpThemeColors);
  const externalTemplate = normalizeClassicPosThemeTemplate(externalPosThemeTemplate);
  const externalColors = normalizeClassicPosThemeColors(externalPosThemeColors);
  return {
    erp_theme_template: erpTemplate,
    erp_theme_colors: erpColors,
    external_pos_theme_template: externalTemplate,
    external_pos_theme_colors: externalColors,
    // Legacy mirror — older clients still read classic_pos_theme_* as External POS theme.
    classic_pos_theme_template: externalTemplate,
    classic_pos_theme_colors: externalColors,
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
  const [erpThemeTemplate, setErpThemeTemplate] = useState(CLASSIC_POS_THEME_DEFAULT);
  const [erpThemeColors, setErpThemeColors] = useState({});
  const [externalPosThemeTemplate, setExternalPosThemeTemplate] = useState(CLASSIC_POS_THEME_DEFAULT);
  const [externalPosThemeColors, setExternalPosThemeColors] = useState({});
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

  function applyThemesFromApi(fromApi) {
    setErpThemeTemplate(fromApi.erp_theme_template);
    setErpThemeColors(fromApi.erp_theme_colors);
    setExternalPosThemeTemplate(fromApi.external_pos_theme_template);
    setExternalPosThemeColors(fromApi.external_pos_theme_colors);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const salesRes = await apiRequest(settingsPath("sales"));
      const fromApi = platformExternalPosFromApi(salesRes);
      setPlatformForm(fromApi);
      applyThemesFromApi(fromApi);
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
      const themeBody = buildThemeSaveBody(
        platformManaged
          ? {
              erpThemeTemplate: platformForm.erp_theme_template,
              erpThemeColors: platformForm.erp_theme_colors,
              externalPosThemeTemplate: platformForm.external_pos_theme_template,
              externalPosThemeColors: platformForm.external_pos_theme_colors,
            }
          : {
              erpThemeTemplate,
              erpThemeColors,
              externalPosThemeTemplate,
              externalPosThemeColors,
            },
      );
      const body = {
        ...themeBody,
        ...(platformManaged
          ? {
              external_pos_layout: platformForm.external_pos_layout,
              show_pos_checkout_on_create: Boolean(platformForm.show_pos_checkout_on_create),
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
      applyThemesFromApi(fromApi);
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
              Choose separate color palettes for <strong>ERP modules</strong> (sidebar and primary
              buttons in Hotel Backoffice and Admin) and for <strong>External POS</strong> when
              enabled. Default is Centrix for both.
            </>
          ) : (
            <>
              Choose separate color palettes for <strong>ERP modules</strong> (Sales, Inventory,
              Admin, and other backoffice screens) and for <strong>External POS</strong> (/pos).
              POS can use Ocean while backoffice stays Centrix, for example.
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
                onChange={setPlatformForm}
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
                      . ERP and External POS themes below are independent — layout is set by the
                      platform.
                    </p>
                  </div>
                ) : null}
                <CentrixSplitThemePickers
                  erpTemplate={erpThemeTemplate}
                  erpColors={erpThemeColors}
                  onErpTemplateChange={setErpThemeTemplate}
                  onErpColorsChange={setErpThemeColors}
                  externalPosTemplate={externalPosThemeTemplate}
                  externalPosColors={externalPosThemeColors}
                  onExternalPosTemplateChange={setExternalPosThemeTemplate}
                  onExternalPosColorsChange={setExternalPosThemeColors}
                  showExternalPos={hasPosSales}
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
