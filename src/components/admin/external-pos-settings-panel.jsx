"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  EMPTY_SALES_ORGANIZATION_FORM,
  salesOrganizationFormFromApi,
  salesOrganizationPayloadFromForm,
  sanitizeSalesOrganizationFormForModules,
} from "@/lib/sales-settings";
import {
  CLASSIC_POS_THEME_DEFAULT,
  normalizeClassicPosThemeTemplate,
} from "@/lib/classic-pos-theme-templates";
import {
  ClassicPosThemePicker,
  ExternalPosPlatformFields,
} from "@/components/admin/external-pos-platform-fields";
import { isPlatformPosCheckoutOnCreateEnabled } from "@/lib/platform-org-features";
import { resolveExternalPosLayout } from "@/lib/external-pos-layout";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 ${
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-slate-300"
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 rounded border-slate-300"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

function platformExternalPosFromApi(res) {
  const sales = res?.sales ?? res ?? {};
  return {
    external_pos_layout: sales.external_pos_layout === "classic" ? "classic" : "modern",
    classic_pos_theme_template: normalizeClassicPosThemeTemplate(sales.classic_pos_theme_template),
    show_pos_checkout_on_create: sales.show_pos_checkout_on_create !== false,
    require_pos_till_float: Boolean(sales.require_pos_till_float),
    enable_pos_cash_rounding: Boolean(sales.enable_pos_cash_rounding),
    receipt_show_all_payment_methods: sales.receipt_show_all_payment_methods !== false,
    enable_pos_order_edit: Boolean(sales.enable_pos_order_edit),
  };
}

function ExternalPosDayToDayFields({
  salesForm,
  setSalesForm,
  hasCustomers,
  posCheckoutEnabled,
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Terminal preferences
      </p>
      <Toggle
        label="Hide expected cash at till close"
        description="When a till session is closed, staff enter the cash they counted without seeing the system's expected drawer balance. After close, variance appears on the Z report."
        checked={salesForm.blind_till_close}
        onChange={(v) => setSalesForm((f) => ({ ...f, blind_till_close: v }))}
      />
      {!posCheckoutEnabled ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          External POS is configured for <strong>save order</strong> (no checkout on create). Checkout
          options below apply when checkout-on-create is enabled.
        </p>
      ) : (
        <>
          <Toggle
            label="Enable barcode scanner"
            description="Scan SKU/barcode to add qty 1 directly to the cart on POS."
            checked={salesForm.enable_barcode_scanner}
            onChange={(v) => setSalesForm((f) => ({ ...f, enable_barcode_scanner: v }))}
          />
          <Toggle
            label="Request customer name on checkout"
            description="When enabled, POS prompts for a customer on save order, hold order, and checkout. Default is walk-in name; staff can switch to Existing customer."
            checked={salesForm.enable_checkout_customer_name}
            onChange={(v) => setSalesForm((f) => ({ ...f, enable_checkout_customer_name: v }))}
          />
          {!hasCustomers ? (
            <p className="text-xs text-slate-500">
              Enable the Customers module to show a credit customer search field at POS checkout.
            </p>
          ) : (
            <Toggle
              label="Credit customer field at POS checkout"
              description="Shows a searchable credit customer field at checkout. Unpaid balance posts to the customer's account."
              checked={salesForm.enable_credit_payment}
              onChange={(v) =>
                setSalesForm((f) => ({
                  ...f,
                  enable_credit_payment: v,
                  allow_credit_pay_now: v ? true : f.allow_credit_pay_now,
                }))
              }
            />
          )}
        </>
      )}
    </div>
  );
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
  const [salesForm, setSalesForm] = useState(EMPTY_SALES_ORGANIZATION_FORM);
  const [platformForm, setPlatformForm] = useState(() => platformExternalPosFromApi({}));
  const [themeTemplate, setThemeTemplate] = useState(CLASSIC_POS_THEME_DEFAULT);
  const [loading, setLoading] = useState(true);

  const modules = capabilities?.modules ?? {};
  const hasPosSales = Boolean(modules["sales.pos"]);
  const hasCustomers = Boolean(modules.customers_suppliers);
  const posCheckoutEnabled = isPlatformPosCheckoutOnCreateEnabled(capabilities);
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
      setSalesForm(
        sanitizeSalesOrganizationFormForModules(salesOrganizationFormFromApi(salesRes), capabilities),
      );
      setPlatformForm(fromApi);
      setThemeTemplate(fromApi.classic_pos_theme_template);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load External POS settings");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mount / path only
  }, [setError, settingsPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    if (!hasPosSales) return;
    setSaving(true);
    try {
      const themeId = normalizeClassicPosThemeTemplate(
        platformManaged ? platformForm.classic_pos_theme_template : themeTemplate,
      );
      const body = {
        ...salesOrganizationPayloadFromForm(salesForm, capabilities),
        // Organization admins own Classic color themes.
        classic_pos_theme_template: themeId,
        ...(platformManaged
          ? {
              external_pos_layout: platformForm.external_pos_layout,
              classic_pos_theme_template: normalizeClassicPosThemeTemplate(
                platformForm.classic_pos_theme_template,
              ),
              show_pos_checkout_on_create: platformForm.show_pos_checkout_on_create !== false,
              require_pos_till_float: Boolean(platformForm.require_pos_till_float),
              enable_pos_cash_rounding: Boolean(platformForm.enable_pos_cash_rounding),
              receipt_show_all_payment_methods:
                platformForm.receipt_show_all_payment_methods !== false,
              enable_pos_order_edit: Boolean(platformForm.enable_pos_order_edit),
            }
          : {}),
      };
      await apiRequest(settingsPath("sales"), { method: "PATCH", body });
      const caps = (await afterSave?.()) ?? capabilities;
      const salesRes = await apiRequest(settingsPath("sales"));
      const fromApi = platformExternalPosFromApi(salesRes);
      setSalesForm(
        sanitizeSalesOrganizationFormForModules(salesOrganizationFormFromApi(salesRes), caps),
      );
      setPlatformForm(fromApi);
      setThemeTemplate(fromApi.classic_pos_theme_template);
      setMessage("External POS settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save External POS settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">External POS</h2>
        <p className="mt-1 text-sm text-slate-500">
          Classic color themes and cashier terminal preferences for the external POS workspace (/pos).
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : !hasPosSales ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            External POS is not enabled for this organization. Ask your platform administrator to enable
            it under Applications.
          </p>
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
                }}
                posEnabled
                showTheme
              />
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium text-slate-900">POS layout</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Current layout:{" "}
                    <span className="font-medium">{isClassic ? "Classic" : "Modern"}</span>
                    {isClassic
                      ? ". Choose colors below."
                      : ". Classic color themes apply when the platform sets layout to Classic."}
                  </p>
                </div>
                {isClassic ? (
                  <ClassicPosThemePicker
                    value={themeTemplate}
                    onChange={setThemeTemplate}
                  />
                ) : null}
              </>
            )}

            <ExternalPosDayToDayFields
              salesForm={salesForm}
              setSalesForm={setSalesForm}
              hasCustomers={hasCustomers}
              posCheckoutEnabled={posCheckoutEnabled}
            />

            <div className="pt-2">
              <PrimaryButton type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save External POS settings"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </section>
    </form>
  );
}
