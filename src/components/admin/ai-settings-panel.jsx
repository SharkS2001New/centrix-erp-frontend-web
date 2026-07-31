"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { aiFormFromApi, aiPayloadFromForm } from "@/lib/ai-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";

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

function patchInsights(setForm, patch) {
  setForm((f) => ({
    ...f,
    insights: { ...f.insights, ...patch },
  }));
}

export function AiSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
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

  const insights = form.insights;

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

              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-base font-medium text-slate-900">AI Insights</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Analyze reports, Stock Pulse, and Sales briefs. After saving, open{" "}
                  <Link href="/reports" className="text-[var(--theme-primary)] hover:underline">
                    Reports
                  </Link>{" "}
                  — look for the <span className="font-medium">AI Insights</span> section (Stock Pulse /
                  Sales brief). On any report, use <span className="font-medium">Analyze with AI</span> next
                  to Print / CSV. Users also need the <span className="font-medium">Use AI assistant</span>{" "}
                  permission on their role.
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

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-3 rounded-lg border border-slate-200 px-4 py-3">
                          <Toggle
                            checked={insights.stock_pulse.enabled}
                            onChange={(enabled) =>
                              patchInsights(setForm, {
                                stock_pulse: { ...insights.stock_pulse, enabled },
                              })
                            }
                            label="Daily Stock Pulse"
                            description="Scheduled digest of low stock and movers."
                          />
                          <Field label="Send at (HH:MM)">
                            <input
                              type="time"
                              className={inputClassName()}
                              value={insights.stock_pulse.schedule_time}
                              onChange={(e) =>
                                patchInsights(setForm, {
                                  stock_pulse: { ...insights.stock_pulse, schedule_time: e.target.value },
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
                              value={insights.stock_pulse.lookback_days}
                              onChange={(e) =>
                                patchInsights(setForm, {
                                  stock_pulse: {
                                    ...insights.stock_pulse,
                                    lookback_days: Number(e.target.value) || 14,
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>

                        <div className="space-y-3 rounded-lg border border-slate-200 px-4 py-3">
                          <Toggle
                            checked={insights.sales_brief.enabled}
                            onChange={(enabled) =>
                              patchInsights(setForm, {
                                sales_brief: { ...insights.sales_brief, enabled },
                              })
                            }
                            label="Daily Sales brief"
                            description="Scheduled sales and cash snapshot."
                          />
                          <Field label="Send at (HH:MM)">
                            <input
                              type="time"
                              className={inputClassName()}
                              value={insights.sales_brief.schedule_time}
                              onChange={(e) =>
                                patchInsights(setForm, {
                                  sales_brief: { ...insights.sales_brief, schedule_time: e.target.value },
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
                              value={insights.sales_brief.lookback_days}
                              onChange={(e) =>
                                patchInsights(setForm, {
                                  sales_brief: {
                                    ...insights.sales_brief,
                                    lookback_days: Number(e.target.value) || 7,
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border border-slate-200 px-4 py-3">
                        <Toggle
                          checked={insights.exception_alerts.enabled}
                          onChange={(enabled) =>
                            patchInsights(setForm, {
                              exception_alerts: { ...insights.exception_alerts, enabled },
                            })
                          }
                          label="Exception alerts"
                          description="Short threshold-based alerts (future digests)."
                        />
                        <Toggle
                          checked={insights.exception_alerts.low_stock}
                          onChange={(low_stock) =>
                            patchInsights(setForm, {
                              exception_alerts: { ...insights.exception_alerts, low_stock },
                            })
                          }
                          label="Low stock"
                          disabled={!insights.exception_alerts.enabled}
                        />
                        <Toggle
                          checked={insights.exception_alerts.unpaid_spike}
                          onChange={(unpaid_spike) =>
                            patchInsights(setForm, {
                              exception_alerts: { ...insights.exception_alerts, unpaid_spike },
                            })
                          }
                          label="Unpaid spike"
                          disabled={!insights.exception_alerts.enabled}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
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
