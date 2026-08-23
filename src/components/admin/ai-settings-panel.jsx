"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  aiFormFromApi,
  aiOrgPayloadFromForm,
  AI_INSIGHT_DIGESTS,
} from "@/lib/ai-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { PasswordInput } from "@/components/auth/password-input";
import { useSettingsApi, useSettingsAfterSave, useSettingsGet } from "@/contexts/settings-api-context";

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
        checked={Boolean(checked)}
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

function SavedKeyField({ label, value, saved, hint, placeholder, onChange }) {
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
          <span className="font-medium">Saved for this organization</span>
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
        <p className="mt-1 text-xs text-slate-500">
          A key is already stored. Leave blank to keep it, or paste a replacement above.
        </p>
      ) : null}
    </Field>
  );
}

function patchInsights(setForm, patch) {
  setForm((f) => ({
    ...f,
    insights: { ...f.insights, ...patch },
  }));
}

function credentialSourceLabel(form) {
  if (form.credential_source === "platform_openai") return "Using free platform OpenAI";
  if (form.credential_source === "platform_gemini") return "Using free platform Gemini";
  if (form.credential_source === "org") return "Using your organization API key";
  if (form.use_platform_ai && form.platform_offers_free_ai) {
    return form.free_ai_provider === "openai" ? "Using free platform OpenAI" : "Using free platform Gemini";
  }
  if (form.has_org_api_key) return "Using your organization API key";
  return "AI credentials not configured";
}

export function AiSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const getSettings = useSettingsGet();
  const [form, setForm] = useState(aiFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSettings("ai")
      .then((res) => {
        if (!cancelled && res) setForm(aiFormFromApi(res));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load AI settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getSettings, setError]);

  async function saveAiSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    setTestResult(null);
    try {
      const res = await apiRequest(settingsPath("ai"), {
        method: "PATCH",
        body: aiOrgPayloadFromForm(form),
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

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    const body = {
      provider: form.provider,
      use_platform_ai: form.use_platform_ai,
    };
    if (!form.use_platform_ai && form.api_key && !form.api_key.startsWith("••••")) {
      body.api_key = form.api_key;
    }
    if (!form.use_platform_ai && form.model) {
      body.model = form.model;
    }
    if (!form.use_platform_ai && form.base_url) {
      body.base_url = form.base_url;
    }

    try {
      const res = await apiRequest(`${settingsPath("ai")}/test-credentials`, {
        method: "POST",
        body,
      });
      setTestResult({
        ok: true,
        message: res?.message || "Connection successful.",
        reply: res?.reply || "",
        provider: res?.provider || form.provider,
        model: res?.model || "",
      });
    } catch (e) {
      const payload = e instanceof ApiError ? e.body : null;
      setTestResult({
        ok: false,
        message: e instanceof ApiError ? e.message : "Connection test failed.",
        error_code: payload?.error_code,
        provider: payload?.provider || form.provider,
        model: payload?.model || "",
      });
    } finally {
      setTesting(false);
    }
  }

  const insights = form.insights;
  const usingOwnKey = !form.use_platform_ai || !form.platform_offers_free_ai;
  const platformProviderLabel =
    form.free_ai_provider === "openai" ? "OpenAI / ChatGPT" : "Google Gemini";

  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="theme-heading text-lg font-medium">AI assistant</h2>
      <p className="theme-subtext mt-1 text-sm">
        The platform administrator enables AI for this organization. You choose whether to use the
        platform&apos;s configured AI or your own API key. Grant the{" "}
        <span className="font-medium">Use AI assistant</span> permission on a role to control which
        employees can use the floating assistant and AI Insights.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : !form.platform_enabled ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">AI is disabled for this organization</p>
          <p className="mt-1 text-xs text-amber-800">
            Contact your platform administrator to enable AI for this organization.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">AI is enabled for this organization</p>
            <p className="mt-1 text-xs text-slate-500">
              To restrict AI to certain employees, edit roles under User Management and toggle{" "}
              <span className="font-medium">Use AI assistant</span>.
            </p>
          </div>

          {form.platform_offers_free_ai ? (
            <Toggle
              checked={form.use_platform_ai}
              onChange={(use_platform_ai) => {
                setTestResult(null);
                setForm((f) => ({ ...f, use_platform_ai }));
              }}
              label="Use platform configured AI"
              description={`When on, this organization uses the platform's free ${platformProviderLabel} credentials. When off, configure your own provider and API key below.`}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Organization API key required</p>
              <p className="mt-1 text-xs text-slate-500">
                Free platform AI is not offered to this organization. Add your own Gemini or OpenAI key
                below.
              </p>
            </div>
          )}

          {form.use_platform_ai && form.platform_offers_free_ai ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-medium">{credentialSourceLabel(form)}</p>
              <p className="mt-1 text-xs text-emerald-800">
                {form.platform_free_ai_configured
                  ? `Connected through the platform's ${platformProviderLabel} configuration. Uncheck above to switch to your own key.`
                  : "Platform free AI is selected, but the platform API key for that provider is not configured yet."}
              </p>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={testing || saving}
                  onClick={testConnection}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {testing ? "Testing…" : `Test platform ${platformProviderLabel}`}
                </button>
              </div>
            </div>
          ) : (
            <>
              <Field label="Provider">
                <select
                  className={inputClassName()}
                  value={form.provider || "openai"}
                  onChange={(e) => {
                    setTestResult(null);
                    setForm((f) => ({ ...f, provider: e.target.value }));
                  }}
                >
                  <option value="openai">OpenAI / ChatGPT</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </Field>

              <SavedKeyField
                label="Organization API key"
                value={form.api_key}
                saved={form.api_key_set}
                hint={form.api_key_hint}
                placeholder={form.provider === "gemini" ? "AQ.… or AIza…" : "sk-…"}
                onChange={(e) => {
                  setTestResult(null);
                  setForm((f) => ({ ...f, api_key: e.target.value }));
                }}
              />

              <Field label="Model (optional)">
                <input
                  className={inputClassName()}
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder={form.provider === "gemini" ? "gemini-3.6-flash" : "gpt-4o-mini"}
                />
              </Field>

              <Field label="API base URL (optional)">
                <input
                  className={inputClassName()}
                  value={form.base_url}
                  onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                  placeholder={
                    form.provider === "gemini"
                      ? "https://generativelanguage.googleapis.com/v1beta"
                      : "https://api.openai.com/v1"
                  }
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={testing || saving}
                  onClick={testConnection}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  {testing
                    ? "Testing…"
                    : `Test ${form.provider === "gemini" ? "Gemini" : "OpenAI"} connection`}
                </button>
              </div>
            </>
          )}

          {testResult ? (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <p className="font-medium">{testResult.ok ? "Connection successful" : "Connection failed"}</p>
              <p className="mt-1 text-xs">{testResult.message}</p>
              {testResult.reply ? (
                <p className="mt-2 rounded bg-white/60 px-2 py-1 font-mono text-xs">{testResult.reply}</p>
              ) : null}
              {testResult.model ? (
                <p className="mt-1 text-xs opacity-80">Model: {testResult.model}</p>
              ) : null}
            </div>
          ) : null}

          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              form.available ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {form.available
              ? `${credentialSourceLabel(form)}. Users with the Use AI assistant permission can chat and run AI Insights.`
              : usingOwnKey
                ? "Add an organization API key above, then test the connection."
                : form.platform_free_ai_configured
                  ? "Platform AI is selected but not yet available — ask platform support to verify credentials."
                  : "Waiting for the platform free-AI key under Platform → Settings → AI credentials."}
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-base font-medium text-slate-900">AI Insights</h3>
            <p className="mt-1 text-sm text-slate-500">
              Morning digests (debtors, tills, exceptions, forecasts), on-demand product/customer
              insights, and <span className="font-medium">Analyze this page with AI</span> on
              Orders / Customer statement / reports. Open{" "}
              <Link href="/reports" className="text-[var(--theme-primary)] hover:underline">
                Reports
              </Link>{" "}
              for the <span className="font-medium">AI Insights</span> hub. Users need{" "}
              <span className="font-medium">Use AI assistant</span> on their role.
            </p>

            <div className="mt-4 space-y-3">
              <Toggle
                checked={insights.enabled}
                onChange={(enabled) => patchInsights(setForm, { enabled })}
                label="Enable AI Insights"
                description="Analyze with AI on reports, dashboard cards, and scheduled digests."
              />

              {insights.enabled ? (
                <>
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">Delivery channels</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Channels must already be configured under{" "}
                      <Link href="/settings" className="text-[var(--theme-primary)] hover:underline">
                        Notifications
                      </Link>{" "}
                      / WhatsApp settings.
                    </p>
                    <div className="mt-3 space-y-2">
                      <Toggle
                        checked={insights.channels.email}
                        onChange={(email) =>
                          patchInsights(setForm, {
                            channels: { ...insights.channels, email },
                          })
                        }
                        label="Email"
                      />
                      <Toggle
                        checked={insights.channels.whatsapp}
                        onChange={(whatsapp) =>
                          patchInsights(setForm, {
                            channels: { ...insights.channels, whatsapp },
                          })
                        }
                        label="WhatsApp"
                      />
                      <Toggle
                        checked={insights.channels.sms}
                        onChange={(sms) =>
                          patchInsights(setForm, {
                            channels: { ...insights.channels, sms },
                          })
                        }
                        label="SMS"
                      />
                    </div>
                  </div>

                  <Field label="Email recipients (comma-separated)">
                    <input
                      className={inputClassName()}
                      value={insights.recipients.emailsText}
                      onChange={(e) =>
                        patchInsights(setForm, {
                          recipients: { ...insights.recipients, emailsText: e.target.value },
                        })
                      }
                      placeholder="ops@example.com, manager@example.com"
                    />
                  </Field>
                  <Field label="SMS phones (comma-separated)">
                    <input
                      className={inputClassName()}
                      value={insights.recipients.phonesText}
                      onChange={(e) =>
                        patchInsights(setForm, {
                          recipients: { ...insights.recipients, phonesText: e.target.value },
                        })
                      }
                      placeholder="+2547…, 07…"
                    />
                  </Field>
                  <Field label="WhatsApp phones (comma-separated)">
                    <input
                      className={inputClassName()}
                      value={insights.recipients.whatsappPhonesText}
                      onChange={(e) =>
                        patchInsights(setForm, {
                          recipients: { ...insights.recipients, whatsappPhonesText: e.target.value },
                        })
                      }
                      placeholder="+2547…"
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {AI_INSIGHT_DIGESTS.map((digest) => {
                      const row = insights[digest.key] ?? {
                        enabled: false,
                        schedule_time: digest.time,
                        lookback_days: digest.lookback,
                      };
                      return (
                        <div
                          key={digest.key}
                          className="space-y-3 rounded-lg border border-slate-200 px-4 py-3"
                        >
                          <Toggle
                            checked={Boolean(row.enabled)}
                            onChange={(enabled) =>
                              patchInsights(setForm, {
                                [digest.key]: { ...row, enabled },
                              })
                            }
                            label={digest.label}
                            description="Scheduled digest when enabled."
                          />
                          <Field label="Send at (HH:MM)">
                            <input
                              type="time"
                              className={inputClassName()}
                              value={row.schedule_time || digest.time}
                              onChange={(e) =>
                                patchInsights(setForm, {
                                  [digest.key]: { ...row, schedule_time: e.target.value },
                                })
                              }
                            />
                          </Field>
                          <Field label="Lookback days">
                            <input
                              type="number"
                              min={1}
                              max={90}
                              className={inputClassName()}
                              value={row.lookback_days ?? digest.lookback}
                              onChange={(e) =>
                                patchInsights(setForm, {
                                  [digest.key]: {
                                    ...row,
                                    lookback_days: Number(e.target.value) || digest.lookback,
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2 rounded-lg border border-slate-200 px-4 py-3">
                    <Toggle
                      checked={insights.exception_alerts.enabled}
                      onChange={(enabled) =>
                        patchInsights(setForm, {
                          exception_alerts: { ...insights.exception_alerts, enabled },
                        })
                      }
                      label="Exception radar (morning)"
                      description="Sends the Exception radar digest when enabled (low stock, unpaid, discounts, voids)."
                    />
                    <Toggle
                      checked={insights.exception_alerts.low_stock}
                      onChange={(low_stock) =>
                        patchInsights(setForm, {
                          exception_alerts: { ...insights.exception_alerts, low_stock },
                        })
                      }
                      label="Include low stock"
                      disabled={!insights.exception_alerts.enabled}
                    />
                    <Toggle
                      checked={insights.exception_alerts.unpaid_spike}
                      onChange={(unpaid_spike) =>
                        patchInsights(setForm, {
                          exception_alerts: { ...insights.exception_alerts, unpaid_spike },
                        })
                      }
                      label="Include unpaid spike"
                      disabled={!insights.exception_alerts.enabled}
                    />
                    <Toggle
                      checked={insights.exception_alerts.unusual_discounts}
                      onChange={(unusual_discounts) =>
                        patchInsights(setForm, {
                          exception_alerts: { ...insights.exception_alerts, unusual_discounts },
                        })
                      }
                      label="Include unusual discounts"
                      disabled={!insights.exception_alerts.enabled}
                    />
                    <Toggle
                      checked={insights.exception_alerts.void_cancel_bursts}
                      onChange={(void_cancel_bursts) =>
                        patchInsights(setForm, {
                          exception_alerts: { ...insights.exception_alerts, void_cancel_bursts },
                        })
                      }
                      label="Include void/cancel bursts"
                      disabled={!insights.exception_alerts.enabled}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <PrimaryButton type="button" onClick={saveAiSettings} disabled={saving}>
            {saving ? "Saving…" : "Save AI settings"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}
