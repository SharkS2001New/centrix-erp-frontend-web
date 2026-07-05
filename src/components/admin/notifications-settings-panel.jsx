"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  IN_APP_ALERT_GROUPS,
  SMTP_ENCRYPTION_OPTIONS,
  inAppAlertsPayloadFromForm,
  notificationChannelsPayloadFromForm,
  notificationsFormFromApi,
} from "@/lib/notifications-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { useSettingsApi } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
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

export function NotificationsSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(notificationsFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sms");

  const visibleTabs = useMemo(
    () => [
      { id: "sms", label: "Text messages (SMS)" },
      { id: "email", label: "Email setup" },
      { id: "in_app", label: "In-app alerts" },
    ],
    [],
  );

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("notifications"))
      .then((res) => setForm(notificationsFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load notification settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("notifications"), {
        method: "PATCH",
        body: {
          ...notificationChannelsPayloadFromForm(form),
          ...inAppAlertsPayloadFromForm(form),
        },
      });
      setForm(notificationsFormFromApi(res));
      setMessage("Notification settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save notification settings");
    } finally {
      setSaving(false);
    }
  }

  const status = form.notifications_status;

  return (
    <form onSubmit={handleSave}>
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Messaging channels</h2>
        <p className="mt-1 text-sm text-slate-500">
          SMS and email delivery for{" "}
          <span className="font-medium text-slate-700">{form.organization_name || "this organization"}</span>.
          Customer alert toggles and templates live under each module — Sales, Finance, Distribution, and
          Manager approvals. Staff bell notifications are configured under In-app alerts.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            <SettingsSubTabBar
              tabs={visibleTabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              ariaLabel="Notification settings"
            />

            {activeTab === "sms" ? (
            <div className="space-y-3">
              <Toggle
                label="Enable SMS channel"
                checked={form.sms_enabled}
                onChange={(v) => setForm((f) => ({ ...f, sms_enabled: v }))}
              />
              {form.sms_enabled ? (
                <>
                  <Field label="Username">
                    <input
                      className={inputClassName()}
                      value={form.africas_talking_username}
                      onChange={(e) => setForm((f) => ({ ...f, africas_talking_username: e.target.value }))}
                    />
                  </Field>
                  <Field label="API key">
                    <input
                      type="password"
                      className={inputClassName()}
                      value={form.africas_talking_api_key}
                      onChange={(e) => setForm((f) => ({ ...f, africas_talking_api_key: e.target.value }))}
                      placeholder="Leave blank to keep existing key"
                    />
                  </Field>
                  <Field label="Sender ID">
                    <input
                      className={inputClassName()}
                      value={form.africas_talking_sender_id}
                      onChange={(e) => setForm((f) => ({ ...f, africas_talking_sender_id: e.target.value }))}
                    />
                  </Field>
                  {status?.issues?.length ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {status.issues.join(" ")}
                    </p>
                  ) : status?.sms_ready ? (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      SMS channel is ready.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            ) : null}

            {activeTab === "email" ? (
            <div className="space-y-3">
              <Toggle
                label="Enable email channel"
                description="Configure SMTP below or leave disabled to use server default mail transport."
                checked={form.email_enabled}
                onChange={(v) => setForm((f) => ({ ...f, email_enabled: v }))}
              />
              {form.email_enabled ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="From name">
                      <input
                        className={inputClassName()}
                        value={form.email_from_name}
                        onChange={(e) => setForm((f) => ({ ...f, email_from_name: e.target.value }))}
                        placeholder={form.organization_name || "Company name"}
                      />
                    </Field>
                    <Field label="From address">
                      <input
                        type="email"
                        className={inputClassName()}
                        value={form.email_from_address}
                        onChange={(e) => setForm((f) => ({ ...f, email_from_address: e.target.value }))}
                        placeholder="noreply@yourcompany.co.ke"
                      />
                    </Field>
                  </div>

                  <Toggle
                    label="Use organization SMTP server"
                    description="When off, email uses the API server default MAIL_* settings."
                    checked={form.smtp_enabled}
                    onChange={(v) => setForm((f) => ({ ...f, smtp_enabled: v }))}
                  />

                  {form.smtp_enabled ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="SMTP host">
                        <input
                          className={inputClassName()}
                          value={form.smtp_host}
                          onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                          placeholder="smtp.gmail.com"
                        />
                      </Field>
                      <Field label="SMTP port">
                        <input
                          type="number"
                          className={inputClassName()}
                          value={form.smtp_port}
                          onChange={(e) => setForm((f) => ({ ...f, smtp_port: e.target.value }))}
                        />
                      </Field>
                      <Field label="SMTP username">
                        <input
                          className={inputClassName()}
                          value={form.smtp_username}
                          onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value }))}
                        />
                      </Field>
                      <Field label="SMTP password">
                        <input
                          type="password"
                          className={inputClassName()}
                          value={form.smtp_password}
                          onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                          placeholder="Leave blank to keep existing password"
                        />
                      </Field>
                      <Field label="Encryption">
                        <select
                          className={inputClassName()}
                          value={form.smtp_encryption}
                          onChange={(e) => setForm((f) => ({ ...f, smtp_encryption: e.target.value }))}
                        >
                          {SMTP_ENCRYPTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  ) : null}

                  {form.mail_from_preview?.address ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Effective sender:{" "}
                      <span className="font-medium text-slate-800">
                        {form.mail_from_preview.name || form.organization_name || "—"}
                      </span>{" "}
                      &lt;{form.mail_from_preview.address}&gt;
                      {status?.uses_organization_smtp ? " · organization SMTP" : status?.mail_transport_configured ? " · server mail" : ""}
                    </p>
                  ) : null}

                  {status?.email_issues?.length ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {status.email_issues.join(" ")}
                    </p>
                  ) : status?.email_ready ? (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Email channel is ready.
                    </p>
                  ) : !status?.mail_transport_configured ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Configure organization SMTP above, or set server <code className="text-xs">MAIL_*</code> variables.
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
            ) : null}

            {activeTab === "in_app" ? (
              <div className="space-y-6">
                <p className="text-sm text-slate-600">
                  Choose which events create notifications in the bell icon for managers and staff. Disabled
                  events are not sent to anyone in this organization.
                </p>
                {IN_APP_ALERT_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
                    {group.items.map((item) => (
                      <Toggle
                        key={item.key}
                        label={item.label}
                        description={item.description}
                        checked={Boolean(form[item.key])}
                        onChange={(v) => setForm((f) => ({ ...f, [item.key]: v }))}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
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
