"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { financeFormFromApi, financePayloadFromForm } from "@/lib/finance-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

function UrlField({ label, value, onChange, placeholder }) {
  return (
    <Field label={label}>
      <input
        className={inputClassName()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </Field>
  );
}

export function FinanceSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { refreshCapabilities } = useAuth();
  const [form, setForm] = useState(financeFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest("/erp/settings/finance")
      .then((res) => setForm(financeFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load finance settings"))
      .finally(() => setLoading(false));
  }, [setError]);

  function setMpesa(field, value) {
    setForm((f) => ({ ...f, mpesa: { ...f.mpesa, [field]: value } }));
  }

  async function saveFinanceSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest("/erp/settings/finance", {
        method: "PATCH",
        body: financePayloadFromForm(form),
      });
      setForm(financeFormFromApi(res));
      await refreshCapabilities();
      setMessage("Finance settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save finance settings");
    } finally {
      setSaving(false);
    }
  }

  const mpesaStatus = form.mpesa_status;
  const mpesa = form.mpesa ?? {};

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium text-slate-900">Finance settings</h2>
      <p className="mt-1 text-sm text-slate-500">Organization-level payment and fiscal configuration.</p>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-slate-900">KRA fiscal device</h3>
            <p className="mt-1 text-sm text-slate-500">
              When enabled, completed POS sales are signed through your on-prem KRA device. When disabled, sales use
              normal VAT line calculations without calling the device.
            </p>
            <div className="mt-3 space-y-3">
              <Toggle
                label="Organization uses KRA device"
                description="Checkout POSTs to the device at /api/complete-workflow. Failed submissions block the sale."
                checked={Boolean(form.enable_kra_device)}
                onChange={(v) => setForm((f) => ({ ...f, enable_kra_device: v }))}
              />
              {form.enable_kra_device ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Device IP / URL">
                    <input
                      className={inputClassName()}
                      value={form.kra_device_ip}
                      onChange={(e) => setForm((f) => ({ ...f, kra_device_ip: e.target.value }))}
                      placeholder="192.168.1.50:8010"
                    />
                  </Field>
                  <Field label="Device serial number (SN)">
                    <input
                      className={inputClassName()}
                      value={form.kra_serial_number}
                      onChange={(e) => setForm((f) => ({ ...f, kra_serial_number: e.target.value }))}
                    />
                  </Field>
                  <Field label="Shop KRA PIN">
                    <input
                      className={inputClassName()}
                      value={form.kra_pin_number}
                      onChange={(e) => setForm((f) => ({ ...f, kra_pin_number: e.target.value.toUpperCase() }))}
                    />
                  </Field>
                  <Field label="PLU register path">
                    <input
                      className={inputClassName()}
                      value={form.kra_plu_register_path}
                      onChange={(e) => setForm((f) => ({ ...f, kra_plu_register_path: e.target.value }))}
                      placeholder="/api/register-plu"
                    />
                  </Field>
                  <div className="flex items-end">
                    <Toggle
                      label="Test mode on device"
                      checked={Boolean(form.kra_device_test_mode)}
                      onChange={(v) => setForm((f) => ({ ...f, kra_device_test_mode: v }))}
                    />
                  </div>
                </div>
              ) : null}
              <Toggle
                label="Submit to KRA on checkout by default"
                description="When the device is enabled, POS checkout includes fiscal submission unless overridden."
                checked={Boolean(form.default_submit_kra)}
                onChange={(v) => setForm((f) => ({ ...f, default_submit_kra: v }))}
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-medium text-slate-900">M-Pesa (paybill / till)</h3>
            <p className="mt-1 text-sm text-slate-500">
              Configure Daraja credentials and callback URLs for this organization. Register the same URLs on the
              Safaricom Daraja portal — the system receives payments at these endpoints for POS check payment.
            </p>

            {mpesaStatus ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase">
                  {mpesaStatus.env ?? "sandbox"}
                </span>
                {mpesaStatus.shortcode ? (
                  <span>
                    Shortcode / till: <strong>{mpesaStatus.shortcode}</strong>
                  </span>
                ) : null}
                <span
                  className={
                    mpesaStatus.ready
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800"
                      : "rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                  }
                >
                  {mpesaStatus.ready ? "Configured" : "Incomplete"}
                </span>
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Environment">
                <select
                  className={inputClassName()}
                  value={mpesa.env ?? "sandbox"}
                  onChange={(e) => setMpesa("env", e.target.value)}
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="live">Live</option>
                </select>
              </Field>
              <Field label="Consumer key">
                <input
                  className={inputClassName()}
                  value={mpesa.consumer_key ?? ""}
                  onChange={(e) => setMpesa("consumer_key", e.target.value)}
                />
              </Field>
              <Field label="Consumer secret">
                <input
                  type="password"
                  className={inputClassName()}
                  value={mpesa.consumer_secret ?? ""}
                  onChange={(e) => setMpesa("consumer_secret", e.target.value)}
                  placeholder="Leave blank to keep existing"
                />
              </Field>
              <Field label="Passkey (Lipa na M-Pesa)">
                <input
                  type="password"
                  className={inputClassName()}
                  value={mpesa.passkey ?? ""}
                  onChange={(e) => setMpesa("passkey", e.target.value)}
                  placeholder="Leave blank to keep existing"
                />
              </Field>
              <Field label="Paybill shortcode (STK)">
                <input
                  className={inputClassName()}
                  value={mpesa.shortcode ?? ""}
                  onChange={(e) => setMpesa("shortcode", e.target.value)}
                />
              </Field>
              <Field label="Till number (PartyB)">
                <input
                  className={inputClassName()}
                  value={mpesa.till_number ?? ""}
                  onChange={(e) => setMpesa("till_number", e.target.value)}
                />
              </Field>
              <Field label="C2B paybill / till shortcode">
                <input
                  className={inputClassName()}
                  value={mpesa.child_storecode ?? ""}
                  onChange={(e) => setMpesa("child_storecode", e.target.value)}
                  placeholder="Same as registered on Daraja"
                />
              </Field>
            </div>

            <div className="mt-4 space-y-3">
              <UrlField
                label="C2B confirmation URL (register on Daraja)"
                value={mpesa.c2b_confirmation_url ?? ""}
                onChange={(v) => setMpesa("c2b_confirmation_url", v)}
                placeholder="https://your-api.example.com/api/v1/payments/c2b/confirmation"
              />
              <UrlField
                label="C2B validation URL (register on Daraja)"
                value={mpesa.c2b_validation_url ?? ""}
                onChange={(v) => setMpesa("c2b_validation_url", v)}
                placeholder="https://your-api.example.com/api/v1/payments/c2b/validation"
              />
              <UrlField
                label="STK push callback URL"
                value={mpesa.stk_callback_url ?? ""}
                onChange={(v) => setMpesa("stk_callback_url", v)}
                placeholder="https://your-api.example.com/api/v1/payments/stk/callback"
              />
            </div>

            {mpesaStatus?.issues?.length ? (
              <ul className="mt-3 list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {mpesaStatus.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}

            <p className="mt-3 text-xs text-slate-500">
              Branches can override till / shortcode under Admin → Branches. Incoming C2B payments are matched to this
              organization by paybill or till number.
            </p>
          </div>

          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void saveFinanceSettings()}>
            {saving ? "Saving…" : "Save finance settings"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}
