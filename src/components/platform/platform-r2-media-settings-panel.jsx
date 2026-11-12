"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PasswordInput } from "@/components/auth/password-input";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const emptyForm = {
  enabled: false,
  use_backup_credentials: true,
  access_key_id: "",
  secret_access_key: "",
  bucket: "",
  endpoint: "",
  region: "auto",
  public_url: "",
  use_path_style_endpoint: true,
  secret_access_key_set: false,
  secret_access_key_hint: "",
};

export function PlatformR2MediaSettingsPanel() {
  const [form, setForm] = useState(emptyForm);
  const [effective, setEffective] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingUpload, setTestingUpload] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const applySettings = useCallback((payload) => {
    const settings = payload?.settings ?? {};
    setForm({
      enabled: Boolean(settings.enabled),
      use_backup_credentials: settings.use_backup_credentials !== false,
      access_key_id: settings.access_key_id ?? "",
      secret_access_key: "",
      bucket: settings.bucket ?? "",
      endpoint: settings.endpoint ?? "",
      region: settings.region || "auto",
      public_url: settings.public_url ?? "",
      use_path_style_endpoint: settings.use_path_style_endpoint !== false,
      secret_access_key_set: Boolean(settings.secret_access_key_set),
      secret_access_key_hint: settings.secret_access_key_hint ?? "",
    });
    setEffective(payload?.effective ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/public-media-storage-settings");
      applySettings(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load media R2 settings.");
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  function payloadFromForm() {
    const body = {
      enabled: Boolean(form.enabled),
      use_backup_credentials: Boolean(form.use_backup_credentials),
      bucket: form.bucket.trim(),
      public_url: form.public_url.trim(),
      use_path_style_endpoint: Boolean(form.use_path_style_endpoint),
    };
    if (!form.use_backup_credentials) {
      body.access_key_id = form.access_key_id.trim();
      body.endpoint = form.endpoint.trim();
      body.region = form.region.trim() || "auto";
      const secret = form.secret_access_key.trim();
      if (secret) body.secret_access_key = secret;
    }
    return body;
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const res = await apiRequest("/admin/public-media-storage-settings", {
        method: "PUT",
        body: payloadFromForm(),
      });
      applySettings(res);
      notifySuccess("Product media R2 settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save media R2 settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await apiRequest("/admin/public-media-storage-settings/test-connection", {
        method: "POST",
        body: payloadFromForm(),
      });
      setTestResult({ kind: "success", message: res.message, detail: res.bucket });
      notifySuccess(res.message || "Connection OK.");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body?.detail || err.message
          : "Cloudflare R2 media connection test failed.";
      setTestResult({ kind: "error", message });
      notifyError(message);
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleTestUpload() {
    setTestingUpload(true);
    setTestResult(null);
    try {
      const res = await apiRequest("/admin/public-media-storage-settings/test-upload", {
        method: "POST",
        body: payloadFromForm(),
      });
      setTestResult({
        kind: "success",
        message: res.message,
        detail: res.file_id,
      });
      notifySuccess(res.message || "Upload OK.");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body?.detail || err.message
          : "Cloudflare R2 media upload test failed.";
      setTestResult({ kind: "error", message });
      notifyError(message);
    } finally {
      setTestingUpload(false);
    }
  }

  const credsLocked = form.use_backup_credentials;

  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Product &amp; media files (R2)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Store hotel menu photos and other public media in Cloudflare R2. Objects are keyed as{" "}
            <span className="font-mono">orgs/&#123;COMPANY_CODE&#125;/…</span> so each organization stays
            separate. Hotel POS still loads via the API and caches on the till.
          </p>
        </div>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={loading || saving}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {effective?.ready ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Media R2 is active
          {effective.bucket ? (
            <>
              {" "}
              · bucket <span className="font-mono">{effective.bucket}</span>
            </>
          ) : null}
          {effective.use_backup_credentials ? <> · using backup API credentials</> : null}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Media R2 is not active. Enable it below — you can reuse the same API token as database
          backups and only set a different media bucket.
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="flex items-start gap-2 text-sm lg:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            disabled={loading || saving}
          />
          <span>Store product photos and public media on Cloudflare R2</span>
        </label>

        <label className="flex items-start gap-2 text-sm lg:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.use_backup_credentials}
            onChange={(e) => setForm((f) => ({ ...f, use_backup_credentials: e.target.checked }))}
            disabled={loading || saving}
          />
          <span>
            Use the same API key as database backups
            {!effective?.backup_credentials_available ? (
              <span className="block text-xs text-amber-800">
                Save backup R2 credentials above first, or untick and enter media credentials here.
              </span>
            ) : (
              <span className="block text-xs text-slate-500">
                Access key, secret, endpoint, and region come from the backup panel. Set the media
                bucket separately.
              </span>
            )}
          </span>
        </label>

        {!credsLocked ? (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Access key ID</span>
              <input
                type="text"
                autoComplete="off"
                className={inputClass}
                value={form.access_key_id}
                onChange={(e) => setForm((f) => ({ ...f, access_key_id: e.target.value }))}
                disabled={loading || saving}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Secret access key</span>
              <PasswordInput
                autoComplete="new-password"
                className={inputClass}
                value={form.secret_access_key}
                onChange={(e) => setForm((f) => ({ ...f, secret_access_key: e.target.value }))}
                placeholder={
                  form.secret_access_key_set
                    ? form.secret_access_key_hint || "•••• saved — leave blank to keep"
                    : "R2 API token secret"
                }
                disabled={loading || saving}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Endpoint</span>
              <input
                type="url"
                className={inputClass}
                value={form.endpoint}
                onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))}
                placeholder="https://&lt;ACCOUNT_ID&gt;.r2.cloudflarestorage.com"
                disabled={loading || saving}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Region</span>
              <input
                type="text"
                className={inputClass}
                value={form.region}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                disabled={loading || saving}
              />
            </label>
          </>
        ) : null}

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Media bucket</span>
          <input
            type="text"
            className={inputClass}
            value={form.bucket}
            onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))}
            placeholder="centrix-media"
            disabled={loading || saving}
          />
        </label>

        <label className="block text-sm lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Public / custom domain URL (needed for direct image loading)
          </span>
          <input
            type="url"
            className={inputClass}
            value={form.public_url}
            onChange={(e) => setForm((f) => ({ ...f, public_url: e.target.value }))}
            placeholder="https://pub-….r2.dev or https://media.example.com"
            disabled={loading || saving}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Enable Public Access on the media bucket in Cloudflare, then paste the r2.dev or custom
            domain here. ERP, mobile, and POS use this for <span className="font-mono">image_url</span>.
            Without it, apps still fall back to authenticated <span className="font-mono">/image/file</span>.
          </span>
        </label>
        {effective?.ready && !effective?.browser_direct_ready ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 lg:col-span-2">
            R2 upload is configured, but no public URL is set — product tiles may not show photos until
            you add an r2.dev / custom domain URL above.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <PrimaryButton
            type="submit"
            showIcon={false}
            disabled={loading || saving || testingConnection || testingUpload}
          >
            {saving ? "Saving…" : "Save media R2 settings"}
          </PrimaryButton>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={loading || saving || testingConnection || testingUpload}
            onClick={() => void handleTestConnection()}
          >
            {testingConnection ? "Testing connection…" : "Test connection"}
          </button>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={loading || saving || testingConnection || testingUpload}
            onClick={() => void handleTestUpload()}
          >
            {testingUpload ? "Uploading test file…" : "Test upload"}
          </button>
        </div>

        {testResult ? (
          <div
            className={`rounded-lg border px-3 py-2 text-sm lg:col-span-2 ${
              testResult.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-950"
            }`}
          >
            <p className="font-medium">{testResult.message}</p>
            {testResult.detail ? (
              <p className="mt-1 break-all font-mono text-xs opacity-90">{testResult.detail}</p>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
