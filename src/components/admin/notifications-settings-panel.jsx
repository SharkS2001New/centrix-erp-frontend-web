"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  NOTIFICATION_SCOPE_OPTIONS,
  SMTP_ENCRYPTION_OPTIONS,
  channelHint,
  notificationsFormFromApi,
  notificationsPayloadFromForm,
} from "@/lib/notifications-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
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

function TemplateFields({ form, setForm, smsKey, emailKey, placeholders, smsDisabled, emailDisabled }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Field label="SMS template">
        <textarea
          className={`${inputClassName()} min-h-[72px]`}
          value={form[smsKey]}
          disabled={smsDisabled}
          onChange={(e) => setForm((f) => ({ ...f, [smsKey]: e.target.value }))}
        />
      </Field>
      <Field label="Email template (optional)">
        <textarea
          className={`${inputClassName()} min-h-[72px]`}
          value={form[emailKey]}
          disabled={emailDisabled}
          placeholder="Uses SMS template if left blank"
          onChange={(e) => setForm((f) => ({ ...f, [emailKey]: e.target.value }))}
        />
      </Field>
      {placeholders ? (
        <p className="lg:col-span-2 text-xs text-slate-500">Placeholders: {placeholders}</p>
      ) : null}
    </div>
  );
}

export function NotificationsSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(notificationsFormFromApi({}));
  const [loading, setLoading] = useState(true);

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
        body: notificationsPayloadFromForm(form),
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
  const autoHint = channelHint(form);

  return (
    <form onSubmit={handleSave}>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">SMS &amp; email notifications</h2>
        <p className="mt-1 text-sm text-slate-500">
          Settings for{" "}
          <span className="font-medium text-slate-700">{form.organization_name || "this organization"}</span>.
          Event toggles send automatically through each enabled channel — SMS and email work independently.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-5 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SMS (Africa&apos;s Talking)</p>
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

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email (this organization)</p>
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

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order placement</p>
              <p className="text-xs text-slate-500">{autoHint}</p>
              <Toggle
                label="Notify customer when order is placed"
                checked={form.notify_on_order_placed}
                onChange={(v) => setForm((f) => ({ ...f, notify_on_order_placed: v }))}
              />
              {form.notify_on_order_placed ? (
                <>
                  <Field label="Apply to">
                    <select
                      className={inputClassName()}
                      value={form.order_placed_scope}
                      onChange={(e) => setForm((f) => ({ ...f, order_placed_scope: e.target.value }))}
                    >
                      {NOTIFICATION_SCOPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <TemplateFields
                    form={form}
                    setForm={setForm}
                    smsKey="order_placed_sms_template"
                    emailKey="order_placed_email_template"
                    placeholders="{order_num}, {order_total}, {amount_paid}, {balance_due}"
                    smsDisabled={!form.sms_enabled}
                    emailDisabled={!form.email_enabled}
                  />
                </>
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Debtor payments</p>
              <p className="text-xs text-slate-500">{autoHint}</p>
              <Toggle
                label="Notify customer when payment is received"
                checked={form.notify_on_debtor_payment}
                onChange={(v) => setForm((f) => ({ ...f, notify_on_debtor_payment: v }))}
              />
              {form.notify_on_debtor_payment ? (
                <>
                  <Field label="Apply to">
                    <select
                      className={inputClassName()}
                      value={form.debtor_payment_scope}
                      onChange={(e) => setForm((f) => ({ ...f, debtor_payment_scope: e.target.value }))}
                    >
                      {NOTIFICATION_SCOPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <TemplateFields
                    form={form}
                    setForm={setForm}
                    smsKey="debtor_payment_sms_template"
                    emailKey="debtor_payment_email_template"
                    placeholders="{order_num}, {amount}, {amount_paid}, {balance_due}"
                    smsDisabled={!form.sms_enabled}
                    emailDisabled={!form.email_enabled}
                  />
                </>
              ) : null}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fulfillment events</p>
              <p className="text-xs text-slate-500">{autoHint}</p>
              <Toggle
                label="Notify customers when trip departs"
                checked={form.notify_on_dispatch}
                onChange={(v) => setForm((f) => ({ ...f, notify_on_dispatch: v }))}
              />
              {form.notify_on_dispatch ? (
                <TemplateFields
                  form={form}
                  setForm={setForm}
                  smsKey="dispatch_sms_template"
                  emailKey="dispatch_email_template"
                  placeholders="{order_num}, {route_name}, {trip_code}"
                  smsDisabled={!form.sms_enabled}
                  emailDisabled={!form.email_enabled}
                />
              ) : null}
              <Toggle
                label="Notify customers on delivery (POD captured)"
                checked={form.notify_on_delivery}
                onChange={(v) => setForm((f) => ({ ...f, notify_on_delivery: v }))}
              />
              {form.notify_on_delivery ? (
                <TemplateFields
                  form={form}
                  setForm={setForm}
                  smsKey="delivery_sms_template"
                  emailKey="delivery_email_template"
                  placeholders="{order_num}"
                  smsDisabled={!form.sms_enabled}
                  emailDisabled={!form.email_enabled}
                />
              ) : null}
            </div>
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
