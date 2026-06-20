"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { securityFormFromApi, securityPayloadFromForm } from "@/lib/security-settings";
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

export function SecuritySettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(securityFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("security"))
      .then((res) => setForm(securityFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load security settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("security"), {
        method: "PATCH",
        body: securityPayloadFromForm(form),
      });
      setForm(securityFormFromApi(res));
      setMessage("Security settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save security settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Security settings</h2>
        <p className="mt-1 text-sm text-slate-500">Session timeout and password policy for this organization.</p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-4">
            <Field label="Session idle timeout (minutes)">
              <input
                type="number"
                min="5"
                max="480"
                className={`${inputClassName()} w-32`}
                value={form.session_idle_minutes}
                onChange={(e) => setForm((f) => ({ ...f, session_idle_minutes: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-500">
                Used for stale session cleanup and detecting active sign-ins on other devices. Screen
                inactivity is handled by the app lock — users unlock with their password instead of
                signing in again.
              </p>
            </Field>
            <Toggle
              label="Require strong passwords"
              description="Enforces mixed case, numbers, and symbols when users set or reset passwords."
              checked={form.require_strong_passwords}
              onChange={(v) => setForm((f) => ({ ...f, require_strong_passwords: v }))}
            />
            <Field label="Minimum password length">
              <input
                type="number"
                min="6"
                max="128"
                className={`${inputClassName()} w-32`}
                value={form.password_min_length}
                onChange={(e) => setForm((f) => ({ ...f, password_min_length: e.target.value }))}
              />
            </Field>
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
