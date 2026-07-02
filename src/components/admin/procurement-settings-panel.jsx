"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  procurementFormFromApi,
  procurementPayloadFromForm,
} from "@/lib/procurement-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";

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

export function ProcurementSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(procurementFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("procurement"))
      .then((res) => setForm(procurementFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load procurement settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("procurement"), {
        method: "PATCH",
        body: procurementPayloadFromForm(form),
      });
      setForm(procurementFormFromApi(res));
      setMessage("Procurement settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save procurement settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Procurement settings</h2>
        <p className="mt-1 text-sm text-slate-500">Defaults for LPOs, goods receipt, and supplier workflows.</p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-4">
            <Field label="Default payment terms (days)">
              <input
                type="number"
                min="0"
                max="365"
                className={`${inputClassName()} w-32`}
                value={form.default_payment_terms_days}
                onChange={(e) => setForm((f) => ({ ...f, default_payment_terms_days: e.target.value }))}
              />
            </Field>
            <Field label="Default receive location">
              <select
                className={inputClassName()}
                value={form.default_receive_location}
                onChange={(e) => setForm((f) => ({ ...f, default_receive_location: e.target.value }))}
              >
                <option value="store">Store / warehouse</option>
                <option value="shop">Shop floor</option>
              </select>
            </Field>
            <Toggle
              label="Email supplier when LPO is issued"
              description="Automatically notify the supplier contact when an approved LPO is finalized."
              checked={form.auto_email_supplier_on_lpo}
              onChange={(v) => setForm((f) => ({ ...f, auto_email_supplier_on_lpo: v }))}
            />
          </div>
        )}
        <div className="mt-6">
          <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
      </section>
    </form>
  );
}
