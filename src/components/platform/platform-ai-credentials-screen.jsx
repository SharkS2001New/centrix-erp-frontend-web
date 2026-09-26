"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { aiFormFromApi, aiPayloadFromForm } from "@/lib/ai-settings";
import { aiTrainingApiBase } from "@/lib/platform-ai-training";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PasswordInput } from "@/components/auth/password-input";

function SavedKeyField({
  label,
  value,
  saved,
  hint,
  placeholder,
  onChange,
}) {
  const hasDraft = Boolean(value && !String(value).startsWith("••••"));

  return (
    <Field label={label}>
      {saved && !hasDraft ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white"
            aria-hidden
          >
            ✓
          </span>
          <span className="font-medium">Saved on this platform</span>
          {hint ? (
            <span className="rounded bg-white/70 px-2 py-0.5 font-mono text-xs text-emerald-800">{hint}</span>
          ) : null}
        </div>
      ) : null}
      <PasswordInput
        className={inputClassName()}
        value={value}
        savedHint={saved && !hasDraft ? hint : ""}
        onChange={onChange}
        placeholder={
          saved && !hasDraft
            ? "Paste a new key only if you want to replace the saved one"
            : placeholder
        }
        autoComplete="off"
      />
      {saved && !hasDraft ? (
        <p className="mt-1 text-xs theme-subtext">
          A key is already stored. Leave this blank to keep it, or paste a replacement above.
        </p>
      ) : null}
    </Field>
  );
}

export function PlatformAiCredentialsScreen({ embedded = false } = {}) {
  const apiBase = aiTrainingApiBase();
  const [aiForm, setAiForm] = useState(aiFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [useBoth, setUseBoth] = useState(false);

  const loadAiSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiBase}/settings`);
      const next = aiFormFromApi(res);
      setAiForm(next);
      const geminiSaved = Boolean(next.gemini_api_key_set);
      const openaiSaved = Boolean(next.api_key_set);
      const preferred = next.free_ai_provider === "openai" ? "openai" : "gemini";
      // Keep the other saved provider visible so Gemini/OpenAI aren't "lost" when switching.
      setUseBoth(
        (preferred === "openai" && geminiSaved) || (preferred === "gemini" && openaiSaved),
      );
    } catch {
      setAiForm(aiFormFromApi({}));
      setUseBoth(false);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadAiSettings();
  }, [loadAiSettings]);

  const freeProvider = aiForm.free_ai_provider === "openai" ? "openai" : "gemini";
  const geminiSaved = Boolean(
    aiForm.gemini_api_key_set || (aiForm.gemini_api_key && !aiForm.gemini_api_key.startsWith("••••")),
  );
  const openaiSaved = Boolean(
    aiForm.api_key_set || (aiForm.api_key && !aiForm.api_key.startsWith("••••")),
  );
  // Always show a provider that already has a key, even if the radio points elsewhere.
  const showGemini = freeProvider === "gemini" || useBoth || geminiSaved;
  const showOpenAi = freeProvider === "openai" || useBoth || openaiSaved;
  const effectiveProvider =
    freeProvider === "openai"
      ? openaiSaved
        ? "openai"
        : geminiSaved
          ? "gemini"
          : "openai"
      : geminiSaved
        ? "gemini"
        : openaiSaved
          ? "openai"
          : "gemini";

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

  async function testCredentials(provider) {
    setTestingProvider(provider);
    setTestResult(null);
    const body = { provider };
    if (provider === "gemini") {
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
      body.model = aiForm.model || null;
      body.base_url = aiForm.base_url || null;
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
        provider: res?.provider || provider,
        model: res?.model || "",
      });
      notifySuccess(res?.message || "Connection successful.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Credential test failed.";
      const payload = err instanceof ApiError ? err.body : null;
      setTestResult({
        ok: false,
        message: payload?.message || message,
        reply: "",
        provider: payload?.provider || provider,
        model: payload?.model || "",
      });
      notifyError(payload?.message || message);
    } finally {
      setTestingProvider(null);
    }
  }

  const busy = saving || testingProvider !== null;
  const canTestGemini = geminiSaved;
  const canTestOpenAi = openaiSaved;

  const body = (
    <section className="max-w-2xl theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="text-sm font-semibold theme-heading">Platform AI credentials</h2>
      <p className="mt-1 text-sm theme-subtext">
        Centrix uses the provider that already has a saved key. Prefer Gemini when a Gemini key is saved, or OpenAI
        (including Groq-compatible keys) when that key is saved. The radio below is only used when both keys are on
        file. Tenants may still add their own API key to override.
      </p>

      {loading ? (
        <p className="mt-4 text-sm theme-subtext">Loading…</p>
      ) : (
        <div className="mt-5 space-y-6">
          {geminiSaved || openaiSaved ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Currently using{" "}
              <span className="font-semibold">
                {effectiveProvider === "openai" ? "OpenAI-compatible" : "Gemini"}
              </span>
              {effectiveProvider !== freeProvider
                ? ` (preferred radio is ${freeProvider === "openai" ? "OpenAI" : "Gemini"}, but that key is missing — using the saved key instead)`
                : null}
              .
            </div>
          ) : null}
          <div className="rounded-lg border px-4 py-3 theme-panel">
            <p className="text-sm font-medium theme-heading">Preferred free AI provider</p>
            <p className="mt-0.5 text-xs theme-subtext">
              Used when both Gemini and OpenAI keys are saved. If only one is saved, Centrix uses that one
              automatically.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm theme-heading">
                <input
                  type="radio"
                  name="free_ai_provider"
                  checked={freeProvider === "gemini"}
                  onChange={() => {
                    setAiForm((f) => ({ ...f, free_ai_provider: "gemini" }));
                    setUseBoth(openaiSaved);
                    setTestResult(null);
                  }}
                />
                Gemini (default)
              </label>
              <label className="flex items-center gap-2 text-sm theme-heading">
                <input
                  type="radio"
                  name="free_ai_provider"
                  checked={freeProvider === "openai"}
                  onChange={() => {
                    setAiForm((f) => ({ ...f, free_ai_provider: "openai" }));
                    setUseBoth(geminiSaved);
                    setTestResult(null);
                  }}
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
                Uses the saved {effectiveProvider === "openai" ? "OpenAI-compatible" : "Gemini"} key — no need to
                reconfigure if that key is already on file.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border px-4 py-3 theme-panel">
            <input
              type="checkbox"
              className="mt-1"
              checked={aiForm.talk_enabled !== false}
              onChange={(e) => setAiForm((f) => ({ ...f, talk_enabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-medium theme-heading">Enable Talk to AI</span>
              <span className="mt-0.5 block text-xs theme-subtext">
                Shows the header mic so users can ask Centrix Assistant by voice and hear a short spoken reply.
                Turn off to hide Talk across all tenants.
              </span>
            </span>
          </label>

          {freeProvider === "openai" && !geminiSaved ? (
            <label className="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3 theme-panel">
              <input
                type="checkbox"
                className="mt-1"
                checked={useBoth}
                onChange={(e) => {
                  setUseBoth(e.target.checked);
                  setTestResult(null);
                }}
              />
              <span>
                <span className="block text-sm font-medium theme-heading">Also configure Gemini (use both)</span>
                <span className="mt-0.5 block text-xs theme-subtext">
                  Optional. Keep a Gemini key on file for switching later, or as a fallback if OpenAI is unavailable.
                </span>
              </span>
            </label>
          ) : null}

          {freeProvider === "gemini" && !openaiSaved ? (
            <label className="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3 theme-panel">
              <input
                type="checkbox"
                className="mt-1"
                checked={useBoth}
                onChange={(e) => {
                  setUseBoth(e.target.checked);
                  setTestResult(null);
                }}
              />
              <span>
                <span className="block text-sm font-medium theme-heading">Also configure OpenAI (use both)</span>
                <span className="mt-0.5 block text-xs theme-subtext">
                  Optional. Keep an OpenAI / Groq key on file if you may switch later.
                </span>
              </span>
            </label>
          ) : null}

          {showOpenAi ? (
            <div className={freeProvider === "openai" ? "grid gap-4 sm:grid-cols-2" : "border-t pt-5 grid gap-4 sm:grid-cols-2"}>
              {freeProvider !== "openai" ? (
                <div className="sm:col-span-2">
                  <h3 className="text-sm font-semibold theme-heading">
                    {openaiSaved ? "OpenAI credentials (saved)" : "OpenAI credentials (optional)"}
                  </h3>
                  <p className="mt-1 text-xs theme-subtext">
                    {openaiSaved
                      ? "Saved on this platform. Used automatically if Gemini is not available."
                      : "Stored for later; free AI remains Gemini until you switch."}
                  </p>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <SavedKeyField
                  label="API key"
                  value={aiForm.api_key}
                  saved={aiForm.api_key_set}
                  hint={aiForm.api_key_hint}
                  placeholder="sk-… / gsk_… / any OpenAI-compatible key"
                  onChange={(e) => setAiForm((f) => ({ ...f, api_key: e.target.value }))}
                />
              </div>
              <Field label="Model (optional)">
                <input
                  className={inputClassName()}
                  value={aiForm.model}
                  onChange={(e) => setAiForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="gpt-4o-mini — or provider model e.g. llama-3.3-70b-versatile"
                />
              </Field>
              <Field label="Base URL (optional)">
                <input
                  className={inputClassName()}
                  value={aiForm.base_url}
                  onChange={(e) => setAiForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder="Leave blank for OpenAI — or set e.g. https://api.groq.com/openai/v1"
                />
                <p className="mt-1 text-xs theme-subtext">
                  Defaults to OpenAI. For Groq, OpenRouter, Together, or any OpenAI-compatible API, paste that
                  provider&apos;s base URL with the key (and a model that provider supports).
                </p>
              </Field>
            </div>
          ) : null}

          {showGemini ? (
            <div className="border-t pt-5">
              <h3 className="text-sm font-semibold theme-heading">
                {freeProvider === "gemini"
                  ? "Gemini credentials"
                  : geminiSaved
                    ? "Gemini credentials (saved)"
                    : "Gemini credentials (optional)"}
              </h3>
              <p className="mt-1 text-xs theme-subtext">
                {freeProvider === "gemini"
                  ? "Required for free tenant Gemini and for platform email/training when that key is the one in use."
                  : geminiSaved
                    ? "Saved on this platform. Used automatically if OpenAI is not available."
                    : "Stored for later; free AI remains OpenAI until you switch."}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <SavedKeyField
                    label="Gemini API key"
                    value={aiForm.gemini_api_key}
                    saved={aiForm.gemini_api_key_set}
                    hint={aiForm.gemini_api_key_hint}
                    placeholder="AQ.… or AIza…"
                    onChange={(e) => setAiForm((f) => ({ ...f, gemini_api_key: e.target.value }))}
                  />
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
          ) : null}

          {testResult ? (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              <p className="font-medium">{testResult.message}</p>
              {testResult.provider || testResult.model || testResult.endpoint ? (
                <p className="mt-1 text-xs opacity-80">
                  {[testResult.provider, testResult.model, testResult.endpoint].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {testResult.ok && testResult.reply ? (
                <p className="mt-2 text-xs whitespace-pre-wrap opacity-90">{testResult.reply}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <PrimaryButton type="button" showIcon={false} onClick={saveAiSettings} disabled={busy}>
              {saving ? "Saving…" : "Save platform credentials"}
            </PrimaryButton>
            {showGemini ? (
              <button
                type="button"
                onClick={() => testCredentials("gemini")}
                disabled={busy || !canTestGemini}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testingProvider === "gemini" ? "Testing Gemini…" : "Test Gemini connection"}
              </button>
            ) : null}
            {showOpenAi ? (
              <button
                type="button"
                onClick={() => testCredentials("openai")}
                disabled={busy || !canTestOpenAi}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {testingProvider === "openai" ? "Testing OpenAI…" : "Test OpenAI connection"}
              </button>
            ) : null}
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
