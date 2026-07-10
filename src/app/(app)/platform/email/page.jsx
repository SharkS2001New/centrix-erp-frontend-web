"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import {
  PLATFORM_MAIL_DEFAULTS,
  platformMailFormFromApi,
  platformMailPayloadFromForm,
} from "@/lib/platform-mail-settings";
import { PLATFORM_EMAIL_PLACEHOLDERS } from "@/lib/platform-ai-compose";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export default function PlatformEmailSettingsPage() {
  const [form, setForm] = useState(() => platformMailFormFromApi(PLATFORM_MAIL_DEFAULTS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-mail/settings");
      setForm(platformMailFormFromApi(res));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load mail settings.");
      setForm(platformMailFormFromApi(PLATFORM_MAIL_DEFAULTS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest("/admin/platform-mail/settings", {
        method: "PUT",
        body: platformMailPayloadFromForm(form),
      });
      setForm(platformMailFormFromApi(res));
      notifySuccess("Platform email settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save mail settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testTo.trim()) {
      notifyError("Enter a test recipient email.");
      return;
    }
    setTesting(true);
    try {
      const res = await apiRequest("/admin/platform-mail/test", {
        method: "POST",
        body: { to: testTo.trim() },
      });
      notifySuccess(res.message ?? "Test email sent.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Test email failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Platform email"
      subtitle="SMTP and From address used to send contracts, quotes, and billing notices from the platform."
      action={
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Email" }]} />

      {loading ? (
        <p className="text-sm text-slate-500">Loading email settings…</p>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">Enable outbound email</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Required before sending contracts or quotes by email.
                </span>
              </span>
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">From name</span>
                <input
                  className={inputClass}
                  value={form.from_name}
                  onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">From address</span>
                <input
                  type="email"
                  className={inputClass}
                  value={form.from_address}
                  onChange={(e) => setForm((f) => ({ ...f, from_address: e.target.value }))}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Reply-To</span>
                <input
                  type="email"
                  className={inputClass}
                  value={form.reply_to}
                  onChange={(e) => setForm((f) => ({ ...f, reply_to: e.target.value }))}
                />
              </label>
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">SMTP server</h2>
            <p className="mt-1 text-xs text-slate-500">
              Use your Google Workspace, Microsoft 365, or transactional provider credentials.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">Host</span>
                <input
                  className={inputClass}
                  value={form.smtp_host}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Port</span>
                <input
                  className={inputClass}
                  value={form.smtp_port}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_port: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Encryption</span>
                <select
                  className={inputClass}
                  value={form.smtp_encryption}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_encryption: e.target.value }))}
                >
                  <option value="tls">TLS</option>
                  <option value="ssl">SSL</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Username</span>
                <input
                  className={inputClass}
                  value={form.smtp_username}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
                <input
                  type="password"
                  className={inputClass}
                  value={form.smtp_password}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                  placeholder={form.smtp_password_set ? "•••••••• (saved — leave blank to keep)" : ""}
                  autoComplete="new-password"
                />
              </label>
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Contract / quote email template</h2>
            <p className="mt-1 text-xs text-slate-500">
              Placeholders: {"{kind}"}, {"{title}"}, {"{reference}"}, {"{customer_name}"}, {"{first_payment}"},{" "}
              {"{renewal_payment}"}, {"{from_name}"}
            </p>

            <div className="mt-4">
              <PlatformAiEmailAssist
                subject={form.contract_email_subject}
                body={form.contract_email_body}
                placeholders={PLATFORM_EMAIL_PLACEHOLDERS}
                onApply={({ subject, body }) =>
                  setForm((f) => ({
                    ...f,
                    contract_email_subject: subject,
                    contract_email_body: body,
                  }))
                }
              />
            </div>

            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Subject</span>
              <input
                className={inputClass}
                value={form.contract_email_subject}
                onChange={(e) => setForm((f) => ({ ...f, contract_email_subject: e.target.value }))}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Body</span>
              <textarea
                className={inputClass}
                rows={8}
                value={form.contract_email_body}
                onChange={(e) => setForm((f) => ({ ...f, contract_email_body: e.target.value }))}
              />
            </label>
          </section>

          <section className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Send test email</h2>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-[16rem] flex-1 text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Recipient</span>
                <input
                  type="email"
                  className={inputClass}
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <button
                type="button"
                disabled={testing || !form.enabled}
                className={SECONDARY_BTN_CLASS}
                onClick={() => void handleTest()}
              >
                {testing ? "Sending…" : "Send test"}
              </button>
            </div>
          </section>

          <div className="flex justify-end">
            <PrimaryButton type="submit" showIcon={false} disabled={saving}>
              {saving ? "Saving…" : "Save email settings"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </CatalogPageShell>
  );
}
