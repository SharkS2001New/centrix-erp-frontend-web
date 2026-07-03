"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { aiFormFromApi, aiPayloadFromForm } from "@/lib/ai-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
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
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function AiSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { refreshCapabilities } = useAuth();
  const { settingsPath } = useSettingsApi();
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(aiFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("ai"))
      .then((res) => setForm(aiFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load AI settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function saveAiSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("ai"), {
        method: "PATCH",
        body: aiPayloadFromForm(form),
      });
      setForm(aiFormFromApi(res));
      if (afterSave) await afterSave();
      setMessage("AI settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="theme-heading text-lg font-medium">AI assistant</h2>
      <p className="theme-subtext mt-1 text-sm">
        Each organization manages its own OpenAI credentials. Keys are stored per organization and never shared
        across tenants. Grant the Use AI assistant permission on a role to show the floating assistant icon for
        those users — they can open it whenever they want.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-4">
          <Toggle
            checked={form.enabled}
            onChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
            label="Enable AI assistant"
            description="When on, users see a floating assistant on every screen — it can guide navigation, answer system questions, and create orders, employees, or reports (with permission). Off-topic questions are declined."
          />

          {form.enabled ? (
            <>
              <Field label="OpenAI API key">
                <input
                  type="password"
                  className={inputClassName()}
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                  placeholder={form.api_key_set ? form.api_key_hint || "••••••••" : "sk-…"}
                  autoComplete="off"
                />
                {form.api_key_set && !form.api_key ? (
                  <p className="mt-1 text-xs text-slate-500">Leave blank to keep the current key ({form.api_key_hint}).</p>
                ) : null}
              </Field>

              <Field label="Model (optional)">
                <input
                  className={inputClassName()}
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                />
              </Field>

              <Field label="API base URL (optional)">
                <input
                  className={inputClassName()}
                  value={form.base_url}
                  onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
              </Field>

              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  form.available ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {form.available
                  ? "AI assistant is configured and available for users in this organization."
                  : !form.api_key_set && !form.api_key
                    ? "Add an API key and save to activate AI for this organization."
                    : "Save settings to apply changes."}
              </div>
            </>
          ) : null}

          <PrimaryButton type="button" onClick={saveAiSettings} disabled={saving}>
            {saving ? "Saving…" : "Save AI settings"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}
