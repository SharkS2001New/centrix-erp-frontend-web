"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  EMPTY_MOBILE_APPLICATION_FORM,
  isOrgMobileSalesEnabled,
  MOBILE_CHECKOUT_MODES,
  MOBILE_PRODUCT_LIST_MODES,
  mobileApplicationFormFromApi,
  mobileApplicationPayloadFromForm,
  normalizeMobileSheetsDefaultDays,
} from "@/lib/sales-settings";
import {
  LOADING_SHEET_PRINT_DEFAULTS,
  loadingSheetPrintFormFromApi,
  loadingSheetPrintPayloadFromForm,
} from "@/lib/loading-sheet-print-settings";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import { LoadingListPrintSettingsFields } from "@/components/admin/loading-list-print-settings-fields";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

function PlatformMobileSummary({ capabilities: capabilitiesProp }) {
  const { capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const mobileOrdersEnabled = isOrgMobileSalesEnabled(capabilities);
  const mobileApp = capabilities?.mobile_app ?? {};

  return (
    <div className="mb-5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-4 text-sm">
      <p className="theme-heading font-medium">Configured by platform administrator</p>
      <p className="theme-subtext mt-1 text-xs">
        Whether this organization uses the mobile application and which mobile modules are enabled is set at
        organization registration. Contact your platform administrator to change it.
      </p>
      <ul className="mt-3 space-y-1 text-xs">
        <li>
          <span className="font-medium">Mobile orders:</span>{" "}
          {mobileOrdersEnabled ? "Enabled" : "Disabled"}
        </li>
        <li>
          <span className="font-medium">Field sales attendance:</span>{" "}
          {mobileApp.field_attendance_enabled ? "Enabled" : "Disabled"}
        </li>
        <li>
          <span className="font-medium">Driver module:</span>{" "}
          {mobileApp.driver_mobile_enabled ? "Enabled" : "Disabled"}
        </li>
        <li>
          <span className="font-medium">Driver attendance:</span>{" "}
          {mobileApp.driver_attendance_enabled ? "Enabled" : "Disabled"}
        </li>
      </ul>
    </div>
  );
}

const EMPTY_FORM = {
  ...EMPTY_MOBILE_APPLICATION_FORM,
  ...LOADING_SHEET_PRINT_DEFAULTS,
};

export function MobileApplicationSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  capabilities: capabilitiesProp,
  onAfterSave,
}) {
  const { capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const distributionEnabled = isDistributionOpsEnabled(capabilities);
  const showLoadingSettings = !distributionEnabled;

  useEffect(() => {
    setLoading(true);
    const requests = [apiRequest(settingsPath("sales"))];
    if (showLoadingSettings) {
      requests.push(apiRequest(settingsPath("distribution")));
    }
    Promise.allSettled(requests)
      .then(([salesResult, distributionResult]) => {
        if (salesResult.status !== "fulfilled") {
          throw salesResult.reason instanceof Error
            ? salesResult.reason
            : new Error("Failed to load mobile settings");
        }
        const mobileForm = mobileApplicationFormFromApi(salesResult.value);
        const loadingForm =
          showLoadingSettings && distributionResult?.status === "fulfilled"
            ? loadingSheetPrintFormFromApi(distributionResult.value)
            : LOADING_SHEET_PRINT_DEFAULTS;
        setForm({ ...mobileForm, ...loadingForm });
        if (showLoadingSettings && distributionResult?.status === "rejected") {
          const detail =
            distributionResult.reason instanceof ApiError
              ? distributionResult.reason.message
              : "Failed to load loading list settings";
          setError(detail);
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load mobile settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath, showLoadingSettings]);

  if (!isOrgMobileSalesEnabled(capabilities)) {
    return null;
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const salesRes = await apiRequest(settingsPath("sales"), {
        method: "PATCH",
        body: mobileApplicationPayloadFromForm(form),
      });
      let loadingForm = {};
      if (showLoadingSettings) {
        const distributionRes = await apiRequest(settingsPath("distribution"), {
          method: "PATCH",
          body: loadingSheetPrintPayloadFromForm(form),
        });
        loadingForm = loadingSheetPrintFormFromApi(distributionRes);
      }
      setForm({
        ...mobileApplicationFormFromApi(salesRes),
        ...loadingForm,
      });
      if (afterSave) await afterSave();
      setMessage("Mobile application settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save mobile settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Mobile application</h2>
        <p className="mt-1 text-sm text-slate-500">
          Settings for the field sales mobile app. Mobile module access is configured by the platform
          administrator.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="mt-5 space-y-8">
              <PlatformMobileSummary capabilities={capabilities} />

              <div>
                <h3 className="text-sm font-medium text-slate-900">Checkout</h3>
                <p className="theme-subtext mt-1 text-xs">
                  Controls whether reps save orders only or collect payment on the mobile app.
                </p>
                <div className="mt-3 space-y-3">
                  {MOBILE_CHECKOUT_MODES.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                        form.mobile_checkout_mode === option.value
                          ? "border-[var(--theme-accent)] bg-[var(--theme-surface-muted)]"
                          : "border-[var(--theme-border)] bg-[var(--theme-surface-muted)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="mobile_checkout_mode"
                        className="mt-1"
                        checked={form.mobile_checkout_mode === option.value}
                        onChange={() =>
                          setForm((f) => ({ ...f, mobile_checkout_mode: option.value }))
                        }
                      />
                      <span>
                        <span className="theme-heading block text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="theme-subtext mt-0.5 block text-xs">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900">Product catalogue</h3>
                <p className="theme-subtext mt-1 text-xs">
                  Controls which products reps see when browsing or searching on the mobile app.
                </p>
                <div className="mt-3 space-y-3">
                  {MOBILE_PRODUCT_LIST_MODES.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                        form.mobile_product_list_mode === option.value
                          ? "border-[var(--theme-accent)] bg-[var(--theme-surface-muted)]"
                          : "border-[var(--theme-border)] bg-[var(--theme-surface-muted)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="mobile_product_list_mode"
                        className="mt-1"
                        checked={form.mobile_product_list_mode === option.value}
                        onChange={() =>
                          setForm((f) => ({ ...f, mobile_product_list_mode: option.value }))
                        }
                      />
                      <span>
                        <span className="theme-heading block text-sm font-medium">
                          {option.label}
                        </span>
                        <span className="theme-subtext mt-0.5 block text-xs">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900">Customer privacy</h3>
                <p className="theme-subtext mt-1 text-xs">
                  Controls what customer contact details the mobile app shows to reps and drivers.
                </p>
                <div className="mt-3 space-y-3">
                  <Toggle
                    label="Show customer phone number in the mobile app"
                    description="When off, the app shows only the customer name — phone numbers are hidden and call, SMS, and WhatsApp shortcuts are disabled for reps and drivers."
                    checked={form.mobile_show_customer_phone === true}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, mobile_show_customer_phone: v }))
                    }
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900">Orders at customers</h3>
                <div className="mt-3 space-y-3">
                  <Toggle
                    label="Require customer location at checkout"
                    description="When enabled, reps must be within the configured radius of the customer's saved coordinates to place an order."
                    checked={form.mobile_enable_checkout_location_verification}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        mobile_enable_checkout_location_verification: v,
                        mobile_allow_offline_orders: v ? f.mobile_allow_offline_orders : false,
                      }))
                    }
                  />
                  {form.mobile_enable_checkout_location_verification ? (
                    <>
                      <Field label="Checkout location radius (metres)">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          className={inputClassName()}
                          value={form.mobile_checkout_location_radius_metres}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              mobile_checkout_location_radius_metres: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Toggle
                        label="Allow checkout without location check"
                        description="Lets reps place the order without GPS radius verification (e.g. customer has no coordinates or rep is outside radius). The order still saves online through the normal cart and checkout — pricing, stock, and payments are unchanged. The sale is flagged as location-not-verified."
                        checked={form.mobile_allow_offline_orders}
                        onChange={(v) => setForm((f) => ({ ...f, mobile_allow_offline_orders: v }))}
                      />
                    </>
                  ) : null}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900">Picking &amp; loading lists</h3>
                <p className="theme-subtext mt-1 text-xs">
                  Default date window for Sales → Picking list and Loading sheets when Distribution is
                  not enabled. Use 1 for today only, or enter how many calendar days to include
                  (including today).
                </p>
                <div className="mt-3">
                  <Field label="Date range (days)">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      className={`${inputClassName()} w-32`}
                      value={form.mobile_sheets_default_days}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          mobile_sheets_default_days: e.target.value,
                        }))
                      }
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {normalizeMobileSheetsDefaultDays(form.mobile_sheets_default_days) === 1
                        ? "Lists open showing today’s records only."
                        : `Lists open showing the last ${normalizeMobileSheetsDefaultDays(form.mobile_sheets_default_days)} days (including today).`}{" "}
                      Staff can still change the From / To filters on each screen.
                    </p>
                  </Field>
                </div>
              </div>

              {showLoadingSettings ? (
                <div>
                  <h3 className="text-sm font-medium text-slate-900">Picking list</h3>
                  <p className="theme-subtext mt-1 text-xs">
                    Column layout for mobile picking lists when Distribution is not enabled. Fonts and
                    footers are under Printouts → Picking lists.
                  </p>
                  <div className="mt-3">
                    <LoadingListPrintSettingsFields
                      form={form}
                      setForm={setForm}
                      showTripFields={false}
                      showFontNote
                      variant="picking"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-xs">
                  <p className="theme-heading font-medium">Picking &amp; loading list layout</p>
                  <p className="theme-subtext mt-1">
                    Distribution is enabled — configure list columns under Distribution → Trips &amp;
                    loading, or Printouts → Loading sheets / Picking lists. The date range above still
                    applies to any non-Distribution mobile sheets.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6">
              <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
                {saving ? "Saving…" : "Save"}
              </PrimaryButton>
            </div>
          </>
        )}
      </section>
    </form>
  );
}
