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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
    setTestResult(null);
    const submittedApiKey = aiForm.api_key;
    const submittedGeminiKey = aiForm.gemini_api_key;
    try {
      const res = await apiRequest(`${apiBase}/settings`, {
        method: "PATCH",
        body: aiPayloadFromForm(aiForm, { includeInsights: false, includePlatformGemini: true }),
      });
      const next = aiFormFromApi(res);
      // Keep keys in memory after save so show/hide still works until reload.
      if (submittedApiKey && !submittedApiKey.startsWith("••••")) {
        next.api_key = submittedApiKey;
      }
      if (submittedGeminiKey && !submittedGeminiKey.startsWith("••••")) {
        next.gemini_api_key = submittedGeminiKey;
      }
      setAiForm(next);
      notifySuccess("Platform AI credentials saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save platform AI settings.");
    } finally {
      setSaving(false);
    }
  }

  async function testCredentials() {
    setTesting(true);
    setTestResult(null);
    const freeProvider = aiForm.free_ai_provider === "openai" ? "openai" : "gemini";
    const body = { provider: freeProvider };
    if (freeProvider === "gemini") {
      if (aiForm.gemini_api_key && !aiForm.gemini_api_key.startsWith("••••")) {
        body.gemini_api_key = aiForm.gemini_api_key;
      }
      if (aiForm.gemini_model) {
        body.gemini_model = aiForm.gemini_model;
      }
    } else {
      if (aiForm.api_key && !aiForm.api_key.startsWith("••••")) {
        body.api_key = aiForm.api_key;
      }
      if (aiForm.model) {
        body.model = aiForm.model;
      }
      if (aiForm.base_url) {
        body.base_url = aiForm.base_url;
      }
    }

    try {
      const res = await apiRequest(`${apiBase}/test-credentials`, {
        method: "POST",
        body,
      });
      setTestResult({
        ok: true,
        message: res?.message || "Connection successful.",
        reply: res?.reply || "",
        provider: res?.provider || freeProvider,
        model: res?.model || "",
      });
      notifySuccess(res?.message || "Connection successful.");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Credential test failed.";
      const payload = err instanceof ApiError ? err.body : null;
      setTestResult({
        ok: false,
        message: payload?.message || message,
        reply: "",
        provider: payload?.provider || freeProvider,
        model: payload?.model || "",
      });
      notifyError(payload?.message || message);
    } finally {
      setTesting(false);
    }
  }

  const freeProvider = aiForm.free_ai_provider === "openai" ? "openai" : "gemini";
  const canTest =
    freeProvider === "gemini"
      ? Boolean(aiForm.gemini_api_key_set || (aiForm.gemini_api_key && !aiForm.gemini_api_key.startsWith("••••")))
      : Boolean(aiForm.api_key_set || (aiForm.api_key && !aiForm.api_key.startsWith("••••")));

  const body = (
    <section className="max-w-2xl theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="text-sm font-semibold theme-heading">Platform AI credentials</h2>
      <p className="mt-1 text-sm theme-subtext">
        Choose which provider to offer free to selected tenant organizations. The same provider powers platform-admin
        tools (email drafting, training console) when enabled below. Tenants may still add their own API key to
        override.
      </p>

      {loading ? (
        <p className="mt-4 text-sm theme-subtext">Loading…</p>
      ) : (
        <div className="mt-5 space-y-6">
          <div className="rounded-lg border px-4 py-3 theme-panel">
            <p className="text-sm font-medium theme-heading">Free AI for selected organizations</p>
            <p className="mt-0.5 text-xs theme-subtext">
              Used when an org has &quot;Offer free platform AI&quot; enabled and no tenant API key of its own.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm theme-heading">
                <input
                  type="radio"
                  name="free_ai_provider"
                  checked={freeProvider === "gemini"}
                  onChange={() => setAiForm((f) => ({ ...f, free_ai_provider: "gemini" }))}
                />
                Gemini (default)
              </label>
              <label className="flex items-center gap-2 text-sm theme-heading">
                <input
                  type="radio"
                  name="free_ai_provider"
                  checked={freeProvider === "openai"}
                  onChange={() => setAiForm((f) => ({ ...f, free_ai_provider: "openai" }))}
                />
                OpenAI
              </label>
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border px-4 py-3 theme-panel">
            <input
              type="checkbox"
              className="mt-1"
              checked={aiForm.enabled}
              onChange={(e) => setAiForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-medium theme-heading">
                Enable platform AI tools (email assist &amp; training)
              </span>
              <span className="mt-0.5 block text-xs theme-subtext">
                {freeProvider === "gemini"
                  ? "Uses the Gemini key below — no OpenAI key required."
                  : "Uses the OpenAI key below for email assist and the AI training console."}
              </span>
            </span>
          </label>

          {freeProvider === "openai" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="OpenAI API key">
                  <PasswordInput
                    className={inputClassName()}
                    value={aiForm.api_key}
                    savedHint={aiForm.api_key_set ? aiForm.api_key_hint : ""}
                    onChange={(e) => setAiForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder={
                      aiForm.api_key_set && !aiForm.api_key
                        ? "Key saved — paste a new key to replace"
                        : "sk-…"
                    }
                    autoComplete="off"
                  />
                  {aiForm.api_key_set && !aiForm.api_key ? (
                    <p className="mt-1 text-xs theme-subtext">
                      Saved key {aiForm.api_key_hint}. Leave blank to keep it, or paste a new key to replace.
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

          {freeProvider === "gemini" ? (
            <div className="border-t pt-5">
              <h3 className="text-sm font-semibold theme-heading">Gemini credentials</h3>
              <p className="mt-1 text-xs theme-subtext">
                Required for free tenant Gemini and for platform email/training when enabled above. Set the key, then
                enable &quot;Offer free platform AI&quot; on chosen organizations.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Gemini API key">
                    <PasswordInput
                      className={inputClassName()}
                      value={aiForm.gemini_api_key}
                      savedHint={aiForm.gemini_api_key_set ? aiForm.gemini_api_key_hint : ""}
                      onChange={(e) => setAiForm((f) => ({ ...f, gemini_api_key: e.target.value }))}
                      placeholder={
                        aiForm.gemini_api_key_set && !aiForm.gemini_api_key
                          ? "Key saved — paste a new key to replace"
                          : "AQ.… or AIza…"
                      }
                      autoComplete="off"
                    />
                    {aiForm.gemini_api_key_set && !aiForm.gemini_api_key ? (
                      <p className="mt-1 text-xs theme-subtext">
                        Saved key {aiForm.gemini_api_key_hint}. Leave blank to keep it, or paste a new key to replace.
                      </p>
                    ) : null}
                  </Field>
                </div>
                <Field label="Gemini model (optional)">
                  <input
                    className={inputClassName()}
                    value={aiForm.gemini_model}
                    onChange={(e) => setAiForm((f) => ({ ...f, gemini_model: e.target.value }))}
                    placeholder="gemini-3.6-flash"
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="border-t pt-5">
              <h3 className="text-sm font-semibold theme-heading">Gemini credentials (optional)</h3>
              <p className="mt-1 text-xs theme-subtext">
                Free AI is set to OpenAI. Keep a Gemini key if you plan to switch later.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Gemini API key">
                    <PasswordInput
                      className={inputClassName()}
                      value={aiForm.gemini_api_key}
                      savedHint={aiForm.gemini_api_key_set ? aiForm.gemini_api_key_hint : ""}
                      onChange={(e) => setAiForm((f) => ({ ...f, gemini_api_key: e.target.value }))}
                      placeholder={
                        aiForm.gemini_api_key_set && !aiForm.gemini_api_key
                          ? "Key saved — paste a new key to replace"
                          : "AQ.… or AIza…"
                      }
                      autoComplete="off"
                    />
                  </Field>
                </div>
                <Field label="Gemini model (optional)">
                  <input
                    className={inputClassName()}
                    value={aiForm.gemini_model}
                    onChange={(e) => setAiForm((f) => ({ ...f, gemini_model: e.target.value }))}
                    placeholder="gemini-3.6-flash"
                  />
                </Field>
              </div>
            </div>
          )}

          {testResult ? (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              <p className="font-medium">{testResult.message}</p>
              {testResult.provider || testResult.model ? (
                <p className="mt-1 text-xs opacity-80">
                  {[testResult.provider, testResult.model].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {testResult.ok && testResult.reply ? (
                <p className="mt-2 text-xs whitespace-pre-wrap opacity-90">{testResult.reply}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <PrimaryButton type="button" showIcon={false} onClick={saveAiSettings} disabled={saving || testing}>
              {saving ? "Saving…" : "Save platform credentials"}
            </PrimaryButton>
            <button
              type="button"
              onClick={testCredentials}
              disabled={saving || testing || !canTest}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? "Testing…" : `Test ${freeProvider === "openai" ? "OpenAI" : "Gemini"} connection`}
            </button>
          </div>
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
      subtitle="Choose free Gemini or OpenAI for selected tenants; enable platform email/training with the same provider."
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
