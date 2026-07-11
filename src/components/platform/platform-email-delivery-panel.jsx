"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PrimaryButton, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar } from "@/components/admin/settings-sub-tabs";
import {
  PLATFORM_MAIL_DEFAULTS,
  platformMailFormFromApi,
  platformMailPayloadFromForm,
} from "@/lib/platform-mail-settings";
import { PLATFORM_EMAIL_PLACEHOLDERS } from "@/lib/platform-ai-compose";
import { PlatformAiEmailAssist } from "@/components/platform/platform-ai-email-assist";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const EMAIL_TABS = [
  { id: "smtp", label: "SMTP & sender" },
  { id: "auth", label: "Auth / 2FA" },
  { id: "imap", label: "IMAP inbox" },
  { id: "templates", label: "Contracts & quotes" },
  { id: "renewals", label: "Renewals" },
];

function resolveEmailTab(tabId) {
  return EMAIL_TABS.some((t) => t.id === tabId) ? tabId : "smtp";
}

export function PlatformEmailDeliveryPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeEmailTab = resolveEmailTab(searchParams.get("email_tab"));

  const [form, setForm] = useState(() => platformMailFormFromApi(PLATFORM_MAIL_DEFAULTS));
  const [mailStats, setMailStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [testingRenewal, setTestingRenewal] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [authTestTo, setAuthTestTo] = useState("");
  const [renewalTestTo, setRenewalTestTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/platform-mail/settings");
      setForm(platformMailFormFromApi(res));
      setMailStats(res.stats ?? null);
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

  function onEmailTabChange(id) {
    if (id === activeEmailTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "email");
    params.set("email_tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest("/admin/platform-mail/settings", {
        method: "PUT",
        body: platformMailPayloadFromForm(form),
      });
      setForm(platformMailFormFromApi(res));
      if (res.stats) setMailStats(res.stats);
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

  async function handleTestAuthMail() {
    const to = authTestTo.trim() || testTo.trim();
    if (!to) {
      notifyError("Enter a recipient for the auth / 2FA test email.");
      return;
    }
    setTestingAuth(true);
    try {
      const res = await apiRequest("/admin/platform-mail/test-auth", {
        method: "POST",
        body: { to },
      });
      notifySuccess(res.message ?? "Auth / 2FA test email sent.");
      try {
        const statsRes = await apiRequest("/admin/platform-mail/stats", { loading: false });
        if (statsRes.stats) setMailStats(statsRes.stats);
      } catch {
        /* ignore */
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Auth / 2FA test email failed.");
    } finally {
      setTestingAuth(false);
    }
  }

  async function handleTestRenewalReminder() {
    const to = renewalTestTo.trim() || testTo.trim();
    if (!to) {
      notifyError("Enter a recipient for the test renewal reminder.");
      return;
    }
    setTestingRenewal(true);
    try {
      const res = await apiRequest("/admin/platform-mail/test-renewal-reminder", {
        method: "POST",
        body: { to },
      });
      notifySuccess(res.message ?? "Test renewal reminder sent.");
      try {
        const statsRes = await apiRequest("/admin/platform-mail/stats", { loading: false });
        if (statsRes.stats) setMailStats(statsRes.stats);
      } catch {
        /* ignore */
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Test renewal reminder failed.");
    } finally {
      setTestingRenewal(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading email settings…</p>;
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
      <SettingsSubTabBar
        tabs={EMAIL_TABS}
        activeTab={activeEmailTab}
        onTabChange={onEmailTabChange}
        ariaLabel="Email delivery sections"
      />

      {activeEmailTab === "smtp" ? (
        <section className="theme-panel space-y-5 rounded-xl border p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">SMTP &amp; sender</h2>
            <p className="mt-1 text-xs text-slate-500">
              Main outbound mailbox for contracts, invoices, mailbox replies, and renewal reminders.
            </p>
          </div>

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
                Required before sending contracts, quotes, or client mail from the mailbox.
              </span>
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
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
              <span className="mt-1 block text-[11px] text-slate-500">
                Used for contracts, invoices, mailbox, and renewal reminders — not for 2FA codes.
              </span>
            </label>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">SMTP</h3>
            <p className="mt-1 text-xs text-slate-500">
              Google Workspace, Microsoft 365, or any transactional SMTP provider.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <h3 className="text-xs font-semibold text-slate-700">Send test email</h3>
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
          </div>
        </section>
      ) : null}

      {activeEmailTab === "auth" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Auth / 2FA email</h2>
          <p className="mt-1 text-xs text-slate-500">
            Separate sender for two-factor and email-verification codes. No Reply-To is set on these
            messages. You can use a different mailbox than contracts and renewals (recommended).
          </p>

          {mailStats ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">2FA codes</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {mailStats.two_factor?.all_time ?? 0}
                </p>
                <p className="text-[11px] text-slate-500">
                  {mailStats.two_factor?.last_30_days ?? 0} in last 30 days
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Email verification</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {mailStats.email_verification?.all_time ?? 0}
                </p>
                <p className="text-[11px] text-slate-500">
                  {mailStats.email_verification?.last_30_days ?? 0} in last 30 days
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Auth total</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {mailStats.auth_codes?.all_time ?? 0}
                </p>
                <p className="text-[11px] text-slate-500">
                  {mailStats.auth_codes?.last_7_days ?? 0} in last 7 days
                </p>
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-500">
            Each send is logged under Platform → Mailbox → Sent (OTP codes are redacted in the stored copy).
          </p>

          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.auth_mail_use_dedicated}
              onChange={(e) =>
                setForm((f) => ({ ...f, auth_mail_use_dedicated: e.target.checked }))
              }
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Use a dedicated mailbox for 2FA / verification
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                When off, codes use the main SMTP with the no-reply From address.
              </span>
            </span>
          </label>

          {!form.auth_mail_use_dedicated ? (
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                No-reply From (when using main SMTP)
              </span>
              <input
                type="email"
                className={inputClass}
                value={form.noreply_address}
                onChange={(e) => setForm((f) => ({ ...f, noreply_address: e.target.value }))}
                placeholder="noreply@yourdomain.com"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                With Gmail SMTP, From usually must match your Gmail account; Centrix still omits
                Reply-To. Prefer a dedicated auth mailbox below for a true noreply sender.
              </span>
            </label>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">From name</span>
                <input
                  className={inputClass}
                  value={form.auth_from_name}
                  onChange={(e) => setForm((f) => ({ ...f, auth_from_name: e.target.value }))}
                  placeholder={form.from_name || "Centrix Security"}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">From address</span>
                <input
                  type="email"
                  className={inputClass}
                  value={form.auth_from_address}
                  onChange={(e) => setForm((f) => ({ ...f, auth_from_address: e.target.value }))}
                  placeholder="noreply@yourdomain.com"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600">SMTP host</span>
                <input
                  className={inputClass}
                  value={form.auth_smtp_host}
                  onChange={(e) => setForm((f) => ({ ...f, auth_smtp_host: e.target.value }))}
                  placeholder="smtp.yourdomain.com"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Port</span>
                <input
                  className={inputClass}
                  value={form.auth_smtp_port}
                  onChange={(e) => setForm((f) => ({ ...f, auth_smtp_port: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Encryption</span>
                <select
                  className={inputClass}
                  value={form.auth_smtp_encryption}
                  onChange={(e) => setForm((f) => ({ ...f, auth_smtp_encryption: e.target.value }))}
                >
                  <option value="tls">TLS</option>
                  <option value="ssl">SSL</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">SMTP username</span>
                <input
                  className={inputClass}
                  value={form.auth_smtp_username}
                  onChange={(e) => setForm((f) => ({ ...f, auth_smtp_username: e.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">SMTP password</span>
                <input
                  type="password"
                  className={inputClass}
                  value={form.auth_smtp_password}
                  onChange={(e) => setForm((f) => ({ ...f, auth_smtp_password: e.target.value }))}
                  placeholder={
                    form.auth_smtp_password_set ? "•••••••• (saved — leave blank to keep)" : ""
                  }
                  autoComplete="new-password"
                />
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <label className="block min-w-[16rem] flex-1 text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Test recipient</span>
              <input
                type="email"
                className={inputClass}
                value={authTestTo}
                onChange={(e) => setAuthTestTo(e.target.value)}
                placeholder={testTo || "you@example.com"}
              />
            </label>
            <button
              type="button"
              disabled={testingAuth || (!form.auth_mail_use_dedicated && !form.enabled)}
              className={SECONDARY_BTN_CLASS}
              onClick={() => void handleTestAuthMail()}
            >
              {testingAuth ? "Sending…" : "Send 2FA test email"}
            </button>
          </div>
        </section>
      ) : null}

      {activeEmailTab === "imap" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">IMAP (inbox sync)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Pull client replies into Platform → Mailbox so you can read and respond from Centrix. Same
            mailbox as SMTP is typical (e.g. imap.gmail.com:993).
          </p>
          {!form.imap_extension_available ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              PHP IMAP extension is not available on the API server yet. Outbound mail still works; rebuild
              the API image (imap enabled) to sync inbox replies.
            </p>
          ) : null}
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.imap_enabled}
              onChange={(e) => setForm((f) => ({ ...f, imap_enabled: e.target.checked }))}
            />
            <span className="text-sm font-medium text-slate-900">Enable IMAP sync</span>
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-600">Host</span>
              <input
                className={inputClass}
                value={form.imap_host}
                onChange={(e) => setForm((f) => ({ ...f, imap_host: e.target.value }))}
                placeholder="imap.gmail.com"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Port</span>
              <input
                className={inputClass}
                value={form.imap_port}
                onChange={(e) => setForm((f) => ({ ...f, imap_port: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Encryption</span>
              <select
                className={inputClass}
                value={form.imap_encryption}
                onChange={(e) => setForm((f) => ({ ...f, imap_encryption: e.target.value }))}
              >
                <option value="ssl">SSL</option>
                <option value="tls">TLS</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Username</span>
              <input
                className={inputClass}
                value={form.imap_username}
                onChange={(e) => setForm((f) => ({ ...f, imap_username: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
              <input
                type="password"
                className={inputClass}
                value={form.imap_password}
                onChange={(e) => setForm((f) => ({ ...f, imap_password: e.target.value }))}
                placeholder={
                  form.imap_password_set ? "•••••••• (saved — leave blank to keep)" : "App password if required"
                }
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-600">Mailbox folder</span>
              <input
                className={inputClass}
                value={form.imap_mailbox}
                onChange={(e) => setForm((f) => ({ ...f, imap_mailbox: e.target.value }))}
                placeholder="INBOX"
              />
            </label>
          </div>
        </section>
      ) : null}

      {activeEmailTab === "templates" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Contract / quote email template</h2>
          <p className="mt-1 text-xs text-slate-500">
            Placeholders: {"{kind}"}, {"{title}"}, {"{reference}"}, {"{customer_name}"},{" "}
            {"{first_payment}"}, {"{renewal_payment}"}, {"{from_name}"}
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
      ) : null}

      {activeEmailTab === "renewals" ? (
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Subscription renewal reminders</h2>
          <p className="mt-1 text-xs text-slate-500">
            Automatically email organization admins (and org email) before a plan expires, with a draft
            renewal invoice PDF attached. Runs daily when enabled.
          </p>

          {mailStats ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Auto reminders sent
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {mailStats.renewal_reminders?.all_time ?? 0}
                </p>
                <p className="text-[11px] text-slate-500">
                  {mailStats.renewal_reminders?.last_30_days ?? 0} in last 30 days ·{" "}
                  {mailStats.renewal_reminders?.last_7_days ?? 0} in last 7 days
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Test reminders sent
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {mailStats.renewal_reminder_tests?.all_time ?? 0}
                </p>
                <p className="text-[11px] text-slate-500">From the test button below</p>
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-slate-500">
            Auto and test reminders appear in Platform → Mailbox → Sent (filter: Renewal reminder).
          </p>

          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.subscription_reminder_enabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, subscription_reminder_enabled: e.target.checked }))
              }
            />
            <span className="text-sm font-medium text-slate-900">
              Send automatic renewal reminders
            </span>
          </label>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Reminder days before expiry
            </span>
            <input
              className={inputClass}
              value={form.subscription_reminder_days}
              onChange={(e) => setForm((f) => ({ ...f, subscription_reminder_days: e.target.value }))}
              placeholder="30,14,7"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Comma-separated day offsets (e.g. 30,14,7). One email is sent per matching day.
            </span>
          </label>

          <p className="mt-4 text-xs text-slate-500">
            Placeholders: {"{customer_name}"}, {"{company_code}"}, {"{plan_name}"}, {"{expires_on}"},{" "}
            {"{days_remaining}"}, {"{invoice_number}"}, {"{total}"}, {"{from_name}"}
          </p>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Subject</span>
            <input
              className={inputClass}
              value={form.renewal_email_subject}
              onChange={(e) => setForm((f) => ({ ...f, renewal_email_subject: e.target.value }))}
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Body</span>
            <textarea
              className={inputClass}
              rows={8}
              value={form.renewal_email_body}
              onChange={(e) => setForm((f) => ({ ...f, renewal_email_body: e.target.value }))}
            />
          </label>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-xs font-medium text-slate-700">Send test renewal reminder</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Sends your current subject/body with sample placeholders and a sample invoice PDF. Does
              not notify a real tenant.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block min-w-[16rem] flex-1 text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Recipient</span>
                <input
                  type="email"
                  className={inputClass}
                  value={renewalTestTo}
                  onChange={(e) => setRenewalTestTo(e.target.value)}
                  placeholder={testTo || "you@example.com"}
                />
              </label>
              <button
                type="button"
                disabled={testingRenewal || !form.enabled}
                className={SECONDARY_BTN_CLASS}
                onClick={() => void handleTestRenewalReminder()}
              >
                {testingRenewal ? "Sending…" : "Send test reminder"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
        <PrimaryButton type="submit" showIcon={false} disabled={saving}>
          {saving ? "Saving…" : "Save email settings"}
        </PrimaryButton>
      </div>
    </form>
  );
}
