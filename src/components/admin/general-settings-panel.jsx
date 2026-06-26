"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DECIMAL_PLACES_OPTIONS,
  DOCUMENT_HEADER_DISPLAY_OPTIONS,
  FISCAL_MONTH_OPTIONS,
  LANGUAGE_OPTIONS,
  THOUSANDS_SEPARATOR_OPTIONS,
  TIMEZONE_OPTIONS,
  generalFormFromApi,
  generalPayloadFromForm,
} from "@/lib/general-settings";
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

export function GeneralSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(generalFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("general"))
      .then((res) => setForm(generalFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load general settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("general"), {
        method: "PATCH",
        body: generalPayloadFromForm(form),
      });
      setForm(generalFormFromApi(res));
      setMessage("General settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save general settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">General settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Organization-wide locale, formatting, and document defaults used across modules.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Default currency">
                <select
                  className={inputClassName()}
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                >
                  {CURRENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Timezone">
                <select
                  className={inputClassName()}
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                >
                  {TIMEZONE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date format">
                <select
                  className={inputClassName()}
                  value={form.date_format}
                  onChange={(e) => setForm((f) => ({ ...f, date_format: e.target.value }))}
                >
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Language">
                <select
                  className={inputClassName()}
                  value={form.language}
                  onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Decimal places">
                <select
                  className={inputClassName()}
                  value={form.decimal_places}
                  onChange={(e) => setForm((f) => ({ ...f, decimal_places: e.target.value }))}
                >
                  {DECIMAL_PLACES_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Thousands separator">
                <select
                  className={inputClassName()}
                  value={form.number_thousands_separator}
                  onChange={(e) => setForm((f) => ({ ...f, number_thousands_separator: e.target.value }))}
                >
                  {THOUSANDS_SEPARATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fiscal year starts">
                <select
                  className={inputClassName()}
                  value={form.fiscal_year_start_month}
                  onChange={(e) => setForm((f) => ({ ...f, fiscal_year_start_month: e.target.value }))}
                >
                  {FISCAL_MONTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Week starts on">
                <select
                  className={inputClassName()}
                  value={form.week_starts_on}
                  onChange={(e) => setForm((f) => ({ ...f, week_starts_on: e.target.value }))}
                >
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </Field>
              <Field label="Default phone country code">
                <input
                  className={inputClassName()}
                  value={form.phone_country_code}
                  onChange={(e) => setForm((f) => ({ ...f, phone_country_code: e.target.value }))}
                />
              </Field>
              <Field label="Default country">
                <input
                  className={inputClassName()}
                  value={form.default_country_code}
                  onChange={(e) => setForm((f) => ({ ...f, default_country_code: e.target.value.toUpperCase() }))}
                  maxLength={4}
                />
              </Field>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Document footer text">
                <textarea
                  className={inputClassName()}
                  rows={3}
                  value={form.document_footer_text}
                  onChange={(e) => setForm((f) => ({ ...f, document_footer_text: e.target.value }))}
                  placeholder="Shown on printed receipts, invoices, and LPO documents."
                />
              </Field>
              <Toggle
                label="Show organization name on documents"
                description="Include your company name and address on printed sales and procurement documents."
                checked={form.show_organization_on_documents}
                onChange={(v) => setForm((f) => ({ ...f, show_organization_on_documents: v }))}
              />
              <Field label="Report and document header">
                <select
                  className={inputClassName()}
                  value={form.document_header_display}
                  onChange={(e) => setForm((f) => ({ ...f, document_header_display: e.target.value }))}
                >
                  {DOCUMENT_HEADER_DISPLAY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
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
