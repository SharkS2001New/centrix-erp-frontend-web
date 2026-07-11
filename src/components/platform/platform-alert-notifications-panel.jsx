"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const alertInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export function PlatformAlertNotificationsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email_digest_enabled: true,
    digest_email: "",
    instant_email_enabled: false,
    whatsapp_instant_enabled: false,
    whatsapp_number: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/system-issue-alert-settings");
      const settings = res.settings ?? res.data?.settings ?? {};
      setForm({
        email_digest_enabled: settings.email_digest_enabled !== false,
        digest_email: settings.digest_email ?? "",
        instant_email_enabled: Boolean(settings.instant_email_enabled),
        whatsapp_instant_enabled: Boolean(settings.whatsapp_instant_enabled),
        whatsapp_number: settings.whatsapp_number ?? "",
      });
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load alert settings.");
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
      const res = await apiRequest("/admin/system-issue-alert-settings", {
        method: "PUT",
        body: {
          email_digest_enabled: Boolean(form.email_digest_enabled),
          digest_email: form.digest_email.trim() || null,
          instant_email_enabled: Boolean(form.instant_email_enabled),
          whatsapp_instant_enabled: Boolean(form.whatsapp_instant_enabled),
          whatsapp_number: form.whatsapp_number.trim() || null,
        },
      });
      const settings = res.settings ?? {};
      setForm({
        email_digest_enabled: settings.email_digest_enabled !== false,
        digest_email: settings.digest_email ?? "",
        instant_email_enabled: Boolean(settings.instant_email_enabled),
        whatsapp_instant_enabled: Boolean(settings.whatsapp_instant_enabled),
        whatsapp_number: settings.whatsapp_number ?? "",
      });
      notifySuccess("Alert notification settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Alert notifications
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Choose how platform admins receive system errors &amp; reports. Instant WhatsApp/email for
            high-priority repeats, new fingerprints, and user reports; daily email for the full open list.
            Delivery uses Platform → Email delivery and WhatsApp credentials.
          </p>
        </div>
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={loading} onClick={() => void load()}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Daily email digest</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.email_digest_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_digest_enabled: e.target.checked }))}
              disabled={loading || saving}
            />
            <span>Send daily digest of all open / acknowledged issues</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Digest email</span>
            <input
              type="email"
              className={alertInputClass}
              value={form.digest_email}
              onChange={(e) => setForm((f) => ({ ...f, digest_email: e.target.value }))}
              placeholder="ops@yourcompany.com"
              disabled={loading || saving}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.instant_email_enabled}
              onChange={(e) => setForm((f) => ({ ...f, instant_email_enabled: e.target.checked }))}
              disabled={loading || saving}
            />
            <span>Also email instantly for high-priority / new / user reports (same address)</span>
          </label>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instant WhatsApp</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.whatsapp_instant_enabled}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_instant_enabled: e.target.checked }))}
              disabled={loading || saving}
            />
            <span>Send instant WhatsApp for high-priority / new fingerprints / user reports</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">WhatsApp number</span>
            <input
              type="tel"
              className={alertInputClass}
              value={form.whatsapp_number}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
              placeholder="0712 345 678 or 254712345678"
              disabled={loading || saving}
            />
          </label>
          <p className="text-[11px] text-slate-500">
            Uses your platform WhatsApp Cloud API credentials (or <code>WHATSAPP_*</code> env). Outside the
            24-hour window Meta may require an approved utility template.
          </p>
        </div>

        <div className="lg:col-span-2">
          <PrimaryButton type="submit" showIcon={false} disabled={loading || saving}>
            {saving ? "Saving…" : "Save notification settings"}
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
