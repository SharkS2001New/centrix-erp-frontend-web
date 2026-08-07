"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { fcmPushFormFromApi, fcmPushPayloadFromForm } from "@/lib/fcm-push-settings";
import {
  PlatformFcmSetupGuideModal,
  PlatformFcmSetupGuideTrigger,
} from "@/components/platform/platform-fcm-setup-guide-modal";
import { notifyError, notifySuccess } from "@/lib/notify";

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      }`}
    >
      {label}
    </span>
  );
}

export function PlatformPushScreen() {
  const [form, setForm] = useState(fcmPushFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/push/settings");
      setForm(fcmPushFormFromApi(res));
    } catch {
      setForm(fcmPushFormFromApi({}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await apiRequest("/admin/push/settings", {
        method: "PATCH",
        body: fcmPushPayloadFromForm(form),
      });
      setForm(fcmPushFormFromApi(res));
      notifySuccess("Mobile push settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save mobile push settings.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTestPush() {
    const userId = Number(form.test_user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      notifyError("Enter a valid user ID for the test push.");
      return;
    }

    setTesting(true);
    try {
      const res = await apiRequest("/admin/push/test", {
        method: "POST",
        body: {
          user_id: userId,
          app: form.test_app,
        },
      });
      if (res?.ok) {
        notifySuccess("Test push sent.");
      } else {
        notifyError(res?.message || "Test push failed.");
      }
      setForm((current) => ({
        ...current,
        diagnostics: res?.diagnostics ?? current.diagnostics,
      }));
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Test push failed.");
    } finally {
      setTesting(false);
    }
  }

  const diagnostics = form.diagnostics ?? {};

  return (
    <CatalogPageShell
      title="Mobile push"
      subtitle="Firebase Cloud Messaging for Centrix Manager (approval requests) and Centrix Mobile field sales (discount outcomes)."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Mobile push" }]} />

      <section className="max-w-3xl rounded-xl border border-[#185FA5]/20 bg-[#185FA5]/5 p-4 shadow-sm dark:border-sky-900 dark:bg-sky-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold theme-heading">New to mobile push?</h2>
            <p className="mt-1 text-sm theme-subtext">
              Follow the step-by-step guide to create a Firebase project, download your service account key, and
              connect it here. FCM has no per-message cost.
            </p>
          </div>
          <PlatformFcmSetupGuideTrigger onClick={() => setGuideOpen(true)} className="shrink-0" />
        </div>
        <ol className="mt-4 grid gap-2 text-xs theme-subtext sm:grid-cols-2">
          <li>1. Create one Firebase project</li>
          <li>2. Register Manager + Mobile Android apps</li>
          <li>3. Enable Firebase Cloud Messaging API</li>
          <li>4. Download service account JSON</li>
          <li>5. Paste project ID + JSON on this page</li>
          <li>6. Users log in on phones → test push</li>
        </ol>
      </section>

      <PlatformFcmSetupGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      <section className="mt-6 max-w-3xl theme-panel rounded-xl border p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold theme-heading">FCM configuration</h2>
          <StatusPill ok={Boolean(diagnostics.ready)} label={diagnostics.ready ? "Ready" : "Not ready"} />
          {form.env_fallback_active ? (
            <StatusPill ok={false} label="Using .env fallback" />
          ) : null}
          <PlatformFcmSetupGuideTrigger onClick={() => setGuideOpen(true)} className="ml-auto" />
        </div>
        <p className="mt-1 text-sm theme-subtext">
          FCM is free. Paste your Firebase service account JSON here instead of editing server <code>.env</code> files.
          Settings apply to the whole platform.
        </p>

        {loading ? (
          <p className="mt-4 text-sm theme-subtext">Loading…</p>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-lg border px-4 py-3 theme-panel">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-medium theme-heading">Enable push notifications</span>
                <span className="mt-0.5 block text-xs theme-subtext">
                  Sends real-time alerts when approvals are created or discount requests are approved/rejected.
                </span>
              </span>
            </label>

            <Field label="Firebase project ID">
              <input
                className={inputClassName()}
                value={form.fcm_project_id}
                onChange={(e) => setForm((f) => ({ ...f, fcm_project_id: e.target.value }))}
                placeholder="centrix-manager-prod"
              />
            </Field>

            <Field label="Service account JSON">
              <textarea
                className={`${inputClassName()} min-h-[160px] font-mono text-xs`}
                value={form.credentials_json}
                onChange={(e) => setForm((f) => ({ ...f, credentials_json: e.target.value, clear_credentials: false }))}
                placeholder={
                  form.credentials_set
                    ? `Current: ${form.credentials_client_email || "saved"} (${form.credentials_source || "platform"}). Paste new JSON to replace.`
                    : "Paste the full JSON key downloaded from Google Cloud / Firebase"
                }
              />
              {form.credentials_set ? (
                <label className="mt-2 flex items-center gap-2 text-xs theme-subtext">
                  <input
                    type="checkbox"
                    checked={form.clear_credentials}
                    onChange={(e) => setForm((f) => ({ ...f, clear_credentials: e.target.checked }))}
                  />
                  Remove stored service account on save
                </label>
              ) : null}
            </Field>

            <label className="flex items-start gap-3 rounded-lg border px-4 py-3 theme-panel">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.ignore_local_tokens}
                onChange={(e) => setForm((f) => ({ ...f, ignore_local_tokens: e.target.checked }))}
              />
              <span>
                <span className="block text-sm font-medium theme-heading">Ignore local dev tokens</span>
                <span className="mt-0.5 block text-xs theme-subtext">
                  Skip placeholder tokens such as <code>mgr-local-*</code> and <code>mob-local-*</code>.
                </span>
              </span>
            </label>

            <PrimaryButton type="button" showIcon={false} onClick={saveSettings} disabled={saving}>
              {saving ? "Saving…" : "Save push settings"}
            </PrimaryButton>
          </div>
        )}
      </section>

      <section className="mt-6 max-w-3xl theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-sm font-semibold theme-heading">Diagnostics</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="theme-subtext">OAuth token</dt>
            <dd className="font-medium theme-heading">{diagnostics.oauth_token_ok ? "OK" : "Failed"}</dd>
          </div>
          <div>
            <dt className="theme-subtext">Credentials file</dt>
            <dd className="font-medium theme-heading">{diagnostics.credentials_file_exists ? "Found" : "Missing"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="theme-subtext">Apps</dt>
            <dd className="mt-1 space-y-1">
              {Object.entries(form.apps ?? {}).map(([channel, label]) => (
                <div key={channel} className="text-sm theme-heading">
                  <span className="font-mono text-xs theme-subtext">{channel}</span> — {label}
                </div>
              ))}
            </dd>
          </div>
          {diagnostics.oauth_error ? (
            <div className="sm:col-span-2">
              <dt className="theme-subtext">OAuth error</dt>
              <dd className="text-sm text-amber-700 dark:text-amber-300">{diagnostics.oauth_error}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-6 max-w-3xl theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-sm font-semibold theme-heading">Send test push</h2>
        <p className="mt-1 text-sm theme-subtext">
          User must be logged in on the device so an FCM token is registered.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="User ID">
            <input
              className={inputClassName()}
              value={form.test_user_id}
              onChange={(e) => setForm((f) => ({ ...f, test_user_id: e.target.value }))}
              placeholder="1"
            />
          </Field>
          <Field label="App channel">
            <select
              className={inputClassName()}
              value={form.test_app}
              onChange={(e) => setForm((f) => ({ ...f, test_app: e.target.value }))}
            >
              <option value="manager">Centrix Manager</option>
              <option value="mobile_sales">Centrix Mobile (sales)</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <PrimaryButton type="button" showIcon={false} onClick={sendTestPush} disabled={testing || !diagnostics.ready}>
            {testing ? "Sending…" : "Send test push"}
          </PrimaryButton>
        </div>
      </section>
    </CatalogPageShell>
  );
}
