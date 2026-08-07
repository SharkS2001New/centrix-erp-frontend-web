"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DECIMAL_PLACES_OPTIONS,
  FISCAL_MONTH_OPTIONS,
  LANGUAGE_OPTIONS,
  THOUSANDS_SEPARATOR_OPTIONS,
  TIMEZONE_OPTIONS,
  generalFormFromApi,
  generalPayloadFromForm,
} from "@/lib/general-settings";
import { Field, PrimaryButton, SearchableSelect, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";

export function GeneralSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
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
      await afterSave();
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
          <div className="mt-5 space-y-8">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Region & language</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Default currency">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.currency}
                    onChange={(next) => setForm((f) => ({ ...f, currency: next }))}
                    options={CURRENCY_OPTIONS}
                  />
                </Field>
                <Field label="Timezone">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.timezone}
                    onChange={(next) => setForm((f) => ({ ...f, timezone: next }))}
                    options={TIMEZONE_OPTIONS}
                  />
                </Field>
                <Field label="Language">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.language}
                    onChange={(next) => setForm((f) => ({ ...f, language: next }))}
                    options={LANGUAGE_OPTIONS}
                  />
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
                    onChange={(e) =>
                      setForm((f) => ({ ...f, default_country_code: e.target.value.toUpperCase() }))
                    }
                    maxLength={4}
                  />
                </Field>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-slate-900">Numbers & calendar</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Date format">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.date_format}
                    onChange={(next) => setForm((f) => ({ ...f, date_format: next }))}
                    options={DATE_FORMAT_OPTIONS}
                  />
                </Field>
                <Field label="Decimal places">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.decimal_places}
                    onChange={(next) => setForm((f) => ({ ...f, decimal_places: next }))}
                    options={DECIMAL_PLACES_OPTIONS}
                  />
                </Field>
                <Field label="Thousands separator">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.number_thousands_separator}
                    onChange={(next) => setForm((f) => ({ ...f, number_thousands_separator: next }))}
                    options={THOUSANDS_SEPARATOR_OPTIONS}
                  />
                </Field>
                <Field label="Fiscal year starts">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.fiscal_year_start_month}
                    onChange={(next) => setForm((f) => ({ ...f, fiscal_year_start_month: next }))}
                    options={FISCAL_MONTH_OPTIONS}
                  />
                </Field>
                <Field label="Week starts on">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.week_starts_on}
                    onChange={(next) => setForm((f) => ({ ...f, week_starts_on: next }))}
                    options={[
                      { value: "monday", label: "Monday" },
                      { value: "sunday", label: "Sunday" },
                    ]}
                  />
                </Field>
              </div>
            </div>
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
