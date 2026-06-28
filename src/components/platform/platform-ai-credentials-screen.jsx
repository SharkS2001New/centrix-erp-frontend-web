"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { aiFormFromApi, aiPayloadFromForm } from "@/lib/ai-settings";
import { aiTrainingApiBase } from "@/lib/platform-ai-training";
import {
  PlatformAiTrainingNav,
} from "@/components/platform/platform-ai-training-nav";
import { notifyError, notifySuccess } from "@/lib/notify";

export function PlatformAiCredentialsScreen() {
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
        body: aiPayloadFromForm(aiForm),
      });
      setAiForm(aiFormFromApi(res));
      notifySuccess("Platform AI credentials saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save platform AI settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="AI credentials"
      subtitle="OpenAI settings for the platform training test console — separate from each tenant's own AI configuration."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "AI training", href: "/platform/ai-training" },
          { label: "Credentials" },
        ]}
      />

      <PlatformAiTrainingNav />

      <section className="max-w-2xl theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-sm font-semibold theme-heading">Platform AI credentials</h2>
        <p className="mt-1 text-sm theme-subtext">
          These keys power the super-admin test console only. Tenant organizations keep their own AI settings under
          Administration — you do not need to enable tenant AI to test platform knowledge notes.
        </p>

        {loading ? (
          <p className="mt-4 text-sm theme-subtext">Loading…</p>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-lg border px-4 py-3 theme-panel">
              <input
                type="checkbox"
                className="mt-1"
                checked={aiForm.enabled}
                onChange={(e) => setAiForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-medium theme-heading">Enable platform AI training</span>
                <span className="mt-0.5 block text-xs theme-subtext">
                  Required before using the test console. Does not turn on AI for tenant organizations.
                </span>
              </span>
            </label>

            {aiForm.enabled ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="OpenAI API key">
                    <input
                      type="password"
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

                <Field label="Model (optional)">
                  <input
                    className={inputClassName()}
                    value={aiForm.model}
                    onChange={(e) => setAiForm((f) => ({ ...f, model: e.target.value }))}
                    placeholder="gpt-4o-mini"
                  />
                </Field>

                <Field label="API base URL (optional)">
                  <input
                    className={inputClassName()}
                    value={aiForm.base_url}
                    onChange={(e) => setAiForm((f) => ({ ...f, base_url: e.target.value }))}
                    placeholder="https://api.openai.com/v1"
                  />
                </Field>
              </div>
            ) : null}

            <PrimaryButton type="button" showIcon={false} onClick={saveAiSettings} disabled={saving}>
              {saving ? "Saving…" : "Save platform credentials"}
            </PrimaryButton>
          </div>
        )}
      </section>
    </CatalogPageShell>
  );
}
