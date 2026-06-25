"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  EMPTY_MOBILE_APPLICATION_FORM,
  isOrgMobileSalesEnabled,
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

  return (
    <div className="mb-5 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-4 text-sm">
      <p className="theme-heading font-medium">Configured by platform administrator</p>
      <p className="theme-subtext mt-1 text-xs">
        Whether this organization uses the mobile application and field-sales backoffice views is set at
        organization registration. Contact your platform administrator to change it.
      </p>
      <ul className="mt-3 space-y-1 text-xs">
        <li>
          <span className="font-medium">Mobile orders:</span>{" "}
          {mobileOrdersEnabled ? "Enabled" : "Disabled"}
        </li>
      </ul>
    </div>
  );
}

export function MobileApplicationSettingsPanel({ saving, setSaving, setError, setMessage, capabilities: capabilitiesProp, onAfterSave }) {
  const { refreshCapabilities, capabilities: authCapabilities } = useAuth();
  const capabilities = capabilitiesProp ?? authCapabilities;
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? refreshCapabilities;
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
            <div className="mt-5 space-y-3">
              <PlatformMobileSummary capabilities={capabilities} />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Checkout
              </p>
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
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Field attendance
              </p>
              <Toggle
                label="Require sign-in photo and location"
                description="When enabled, sales reps must take a photo and capture GPS when signing in and signing out on the mobile app. Sessions appear under HR → Time & attendance → Field attendance and Sales → Field sales → Field attendance."
                checked={form.mobile_enable_field_attendance}
                onChange={(v) => setForm((f) => ({ ...f, mobile_enable_field_attendance: v }))}
              />
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
