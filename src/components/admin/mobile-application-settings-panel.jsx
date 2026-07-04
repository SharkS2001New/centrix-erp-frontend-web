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
} from "@/lib/sales-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";

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

export function MobileApplicationSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  capabilities: capabilitiesProp,
  onAfterSave,
}) {
  const { refreshCapabilities, capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(EMPTY_MOBILE_APPLICATION_FORM);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("sales"))
      .then((res) => setForm(mobileApplicationFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load mobile settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  if (!isOrgMobileSalesEnabled(capabilities)) {
    return null;
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("sales"), {
        method: "PATCH",
        body: mobileApplicationPayloadFromForm(form),
      });
      setForm(mobileApplicationFormFromApi(res));
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
