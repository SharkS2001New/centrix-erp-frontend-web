"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  securityFormFromApi,
  securityPayloadFromForm,
  validateSecurityForm,
} from "@/lib/security-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { useAuth } from "@/contexts/auth-context";
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

export function SecuritySettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { settingsPath } = useSettingsApi();
  const { refreshCapabilities } = useAuth();
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(securityFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sessions");

  const visibleTabs = useMemo(
    () => [
      { id: "sessions", label: "Sign-in & screen lock" },
      { id: "passwords", label: "Password rules" },
    ],
    [],
  );

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("security"))
      .then((res) => setForm(securityFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load security settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    const validationError = validateSecurityForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("security"), {
        method: "PATCH",
        body: securityPayloadFromForm(form),
      });
      setForm(securityFormFromApi(res));
      if (afterSave) await afterSave();
      setMessage("Security settings saved for this organization.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save security settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Security settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Session timeouts apply to all users in this organization. Password policy applies when users
          set or change passwords.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <SettingsSubTabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              ariaLabel="Security settings"
            />

            {activeTab === "sessions" ? (
          <div className="space-y-4">
            <Field label="Screen lock after inactivity (minutes)">
              <input
                type="number"
                min="1"
                max="120"
                className={`${inputClassName()} w-32`}
                value={form.screen_lock_minutes}
                onChange={(e) => setForm((f) => ({ ...f, screen_lock_minutes: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-500">
                Shows the lock screen; users unlock with their password or a registered passkey without signing in again.
              </p>
            </Field>
            <Field label="Sign out after inactivity (minutes)">
              <input
                type="number"
                min="5"
                max="480"
                className={`${inputClassName()} w-32`}
                value={form.session_idle_minutes}
                onChange={(e) => setForm((f) => ({ ...f, session_idle_minutes: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-500">
                Fully ends the session and returns users to the login page. Must be greater than the
                screen lock time.
              </p>
            </Field>
          </div>
            ) : null}

            {activeTab === "passwords" ? (
          <div className="space-y-4">
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
            <Toggle
              label="Require periodic password change"
              description="Prompt users to update passwords after the configured number of days."
              checked={form.password_expiry_enabled}
              onChange={(v) => setForm((f) => ({ ...f, password_expiry_enabled: v }))}
            />
            {form.password_expiry_enabled ? (
              <>
                <Field label="Password expires after (days)">
                  <input
                    type="number"
                    min="30"
                    max="730"
                    className={`${inputClassName()} w-32`}
                    value={form.password_expiry_days}
                    onChange={(e) => setForm((f) => ({ ...f, password_expiry_days: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-slate-500">Default is 90 days (about 3 months).</p>
                </Field>
                <Field label="Reminder skips before lockout">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    className={`${inputClassName()} w-32`}
                    value={form.password_expiry_max_skips}
                    onChange={(e) => setForm((f) => ({ ...f, password_expiry_max_skips: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Users can skip or defer the prompt this many times; the next reminder requires a password
                    change with the current password.
                  </p>
                </Field>
              </>
            ) : null}
          </div>
            ) : null}
          </div>
        )}
        <div className="mt-6">
          <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
            {saving ? "Saving…" : "Save security settings"}
          </PrimaryButton>
        </div>
      </section>
    </form>
  );
}
