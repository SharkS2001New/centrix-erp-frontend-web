"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { aiFormFromApi, aiPayloadFromForm } from "@/lib/ai-settings";
import { aiTrainingApiBase } from "@/lib/platform-ai-training";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PasswordInput } from "@/components/auth/password-input";

export function PlatformAiCredentialsScreen({ embedded = false } = {}) {
  const apiBase = aiTrainingApiBase();
  const [aiForm, setAiForm] = useState(aiFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAiSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiBase}/settings`);
      setAiForm(aiFormFromApi(res));
    } catch {
      setAiForm(aiFormFromApi({}));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadAiSettings();
  }, [loadAiSettings]);

  async function saveAiSettings() {
    setSaving(true);
    try {
      const res = await apiRequest(`${apiBase}/settings`, {
        method: "PATCH",
        body: aiPayloadFromForm(aiForm, { includeInsights: false, includePlatformGemini: true }),
      });
      setAiForm(aiFormFromApi(res));
      notifySuccess("Platform AI credentials saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save platform AI settings.");
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <section className="max-w-2xl theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="text-sm font-semibold theme-heading">Platform AI credentials</h2>
      <p className="mt-1 text-sm theme-subtext">
        OpenAI powers platform-admin tools (email drafting, training console). Gemini can be shared with
        selected tenant organizations from Platform → Organization → Sales behaviour.
      </p>

      {loading ? (
        <p className="mt-4 text-sm theme-subtext">Loading…</p>
      ) : (
        <div className="mt-5 space-y-6">
          <label className="flex items-start gap-3 rounded-lg border px-4 py-3 theme-panel">
            <input
              type="checkbox"
              className="mt-1"
              checked={aiForm.enabled}
              onChange={(e) => setAiForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-medium theme-heading">Enable platform OpenAI tools</span>
              <span className="mt-0.5 block text-xs theme-subtext">
                Required for email assist and the AI training test console. Separate from Gemini for tenants.
              </span>
            </span>
          </label>

          {aiForm.enabled ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="OpenAI API key">
                  <PasswordInput
                    className={inputClassName()}
                    value={aiForm.api_key}
                    onChange={(e) => setAiForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder={aiForm.api_key_set ? aiForm.api_key_hint || "••••••••" : "sk-…"}
                    autoComplete="off"
                  />
                  {aiForm.api_key_set && !aiForm.api_key ? (
                    <p className="mt-1 text-xs theme-subtext">
                      Leave blank to keep the current key ({aiForm.api_key_hint}).
                    </p>
                  ) : null}
                </Field>
              </div>

              <Field label="OpenAI model (optional)">
                <input
                  className={inputClassName()}
                  value={aiForm.model}
                  onChange={(e) => setAiForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="gpt-4o-mini"
                />
              </Field>

              <Field label="OpenAI base URL (optional)">
                <input
                  className={inputClassName()}
                  value={aiForm.base_url}
                  onChange={(e) => setAiForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                />
              </Field>
            </div>
          ) : null}

          <div className="border-t pt-5">
            <h3 className="text-sm font-semibold theme-heading">Gemini for tenant organizations</h3>
            <p className="mt-1 text-xs theme-subtext">
              Set one Gemini key here, then enable &quot;Use platform Gemini&quot; on chosen organizations.
              Those orgs do not need their own API key.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Gemini API key">
                  <PasswordInput
                    className={inputClassName()}
                    value={aiForm.gemini_api_key}
                    onChange={(e) => setAiForm((f) => ({ ...f, gemini_api_key: e.target.value }))}
                    placeholder={
                      aiForm.gemini_api_key_set ? aiForm.gemini_api_key_hint || "••••••••" : "AIza…"
                    }
                    autoComplete="off"
                  />
                  {aiForm.gemini_api_key_set && !aiForm.gemini_api_key ? (
                    <p className="mt-1 text-xs theme-subtext">
                      Leave blank to keep the current key ({aiForm.gemini_api_key_hint}).
                    </p>
                  ) : null}
                </Field>
              </div>
              <Field label="Gemini model (optional)">
                <input
                  className={inputClassName()}
                  value={aiForm.gemini_model}
                  onChange={(e) => setAiForm((f) => ({ ...f, gemini_model: e.target.value }))}
                  placeholder="gemini-3.7-flash"
                />
              </Field>
            </div>
          </div>

          <PrimaryButton type="button" showIcon={false} onClick={saveAiSettings} disabled={saving}>
            {saving ? "Saving…" : "Save platform credentials"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );

  if (embedded) {
    return body;
  }

  return (
    <CatalogPageShell
      title="AI credentials"
      subtitle="OpenAI for platform tools; Gemini key shared with selected tenant organizations."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Settings", href: "/platform/settings" },
          { label: "AI credentials" },
        ]}
      />
      {body}
    </CatalogPageShell>
  );
}
