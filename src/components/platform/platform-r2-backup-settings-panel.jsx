"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const emptyR2Form = {
  enabled: false,
  access_key_id: "",
  secret_access_key: "",
  bucket: "",
  endpoint: "",
  region: "auto",
  prefix: "backups/database",
  public_url: "",
  use_path_style_endpoint: true,
  secret_access_key_set: false,
  secret_access_key_hint: "",
};

export function PlatformR2BackupSettingsPanel() {
  const [r2Status, setR2Status] = useState(null);
  const [r2Form, setR2Form] = useState(emptyR2Form);
  const [loading, setLoading] = useState(true);
  const [savingR2, setSavingR2] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingUpload, setTestingUpload] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const applyR2Settings = useCallback((payload) => {
    const settings = payload?.settings ?? {};
    setR2Form({
      enabled: Boolean(settings.enabled),
      access_key_id: settings.access_key_id ?? "",
      secret_access_key: "",
      bucket: settings.bucket ?? "",
      endpoint: settings.endpoint ?? "",
      region: settings.region || "auto",
      prefix: settings.prefix || "backups/database",
      public_url: settings.public_url ?? "",
      use_path_style_endpoint: settings.use_path_style_endpoint !== false,
      secret_access_key_set: Boolean(settings.secret_access_key_set),
      secret_access_key_hint: settings.secret_access_key_hint ?? "",
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, backupsRes] = await Promise.all([
        apiRequest("/admin/database-backup-settings"),
        apiRequest("/admin/database-backups").catch(() => null),
      ]);
      applyR2Settings(settingsRes);
      if (backupsRes?.r2) {
        setR2Status(backupsRes.r2);
      } else if (settingsRes?.effective) {
        setR2Status({
          upload_ready: Boolean(settingsRes.effective.upload_ready),
          configured: Boolean(settingsRes.effective.configured),
          bucket: settingsRes.effective.bucket ?? null,
          prefix: settingsRes.effective.prefix ?? "backups/database",
          issues: [],
        });
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load R2 backup settings.");
    } finally {
      setLoading(false);
    }
  }, [applyR2Settings]);

  useEffect(() => {
    void load();
  }, [load]);

  function r2PayloadFromForm() {
    const body = {
      enabled: Boolean(r2Form.enabled),
      access_key_id: r2Form.access_key_id.trim(),
      bucket: r2Form.bucket.trim(),
      endpoint: r2Form.endpoint.trim(),
      region: r2Form.region.trim() || "auto",
      prefix: r2Form.prefix.trim() || "backups/database",
      public_url: r2Form.public_url.trim(),
      use_path_style_endpoint: Boolean(r2Form.use_path_style_endpoint),
    };
    const secret = r2Form.secret_access_key.trim();
    if (secret && !secret.startsWith("••••")) {
      body.secret_access_key = secret;
    }
    return body;
  }

  async function handleSaveR2(e) {
    e.preventDefault();
    setSavingR2(true);
    setTestResult(null);
    try {
      const res = await apiRequest("/admin/database-backup-settings", {
        method: "PUT",
        body: r2PayloadFromForm(),
      });
      applyR2Settings(res);
      setR2Status({
        upload_ready: Boolean(res.effective?.upload_ready),
        configured: Boolean(res.effective?.configured),
        bucket: res.effective?.bucket ?? null,
        prefix: res.effective?.prefix ?? "backups/database",
        issues: [],
      });
      notifySuccess("Cloudflare R2 backup settings saved.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save R2 settings.");
    } finally {
      setSavingR2(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await apiRequest("/admin/database-backup-settings/test-connection", {
        method: "POST",
        body: r2PayloadFromForm(),
      });
      setTestResult({
        kind: "success",
        message: res.message ?? "Connected to Cloudflare R2 successfully.",
        detail: res.bucket ? `Bucket: ${res.bucket}` : null,
      });
      notifySuccess(res.message ?? "R2 connection OK.");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body?.detail || err.message
          : "Cloudflare R2 connection test failed.";
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
      const res = await apiRequest("/admin/database-backup-settings/test-upload", {
        method: "POST",
        body: r2PayloadFromForm(),
      });
      const detailParts = [];
      if (res.file_id) detailParts.push(`Object: ${res.file_id}`);
      if (res.web_view_link) detailParts.push(res.web_view_link);
      setTestResult({
        kind: "success",
        message: res.message ?? "Test file uploaded to Cloudflare R2.",
        detail: detailParts.join(" · ") || null,
      });
      notifySuccess(res.message ?? "R2 upload test OK.");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.body?.detail || err.message
          : "Cloudflare R2 upload test failed.";
      setTestResult({ kind: "error", message });
      notifyError(message);
    } finally {
      setTestingUpload(false);
    }
  }

  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Cloudflare R2 offsite upload</h2>
          <p className="mt-1 text-xs text-slate-500">
            After each local database dump, the backup is copied to your R2 bucket.
            Leave the secret blank to keep the current value. Manage backup files on{" "}
            <a href="/platform/database-backups" className="font-medium text-[#185FA5] hover:underline">
              Database backups
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          disabled={loading || savingR2}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {r2Status?.upload_ready ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          R2 upload is active
          {r2Status.bucket ? (
            <>
              {" "}
              · bucket <span className="font-mono">{r2Status.bucket}</span>
            </>
          ) : null}
          {r2Status.prefix ? (
            <>
              {" "}
              · prefix <span className="font-mono">{r2Status.prefix}</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          R2 upload is not active yet. Enable it and fill in bucket, endpoint, and API token credentials below.
          {r2Status?.issues?.length ? (
            <ul className="mt-2 list-inside list-disc space-y-1 text-amber-900">
              {r2Status.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <form onSubmit={(e) => void handleSaveR2(e)} className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="flex items-start gap-2 text-sm lg:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={r2Form.enabled}
            onChange={(e) => setR2Form((f) => ({ ...f, enabled: e.target.checked }))}
            disabled={loading || savingR2}
          />
          <span>Upload backups to Cloudflare R2 after each backup run</span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Access key ID</span>
          <input
            type="text"
            autoComplete="off"
            className={inputClass}
            value={r2Form.access_key_id}
            onChange={(e) => setR2Form((f) => ({ ...f, access_key_id: e.target.value }))}
            disabled={loading || savingR2}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Secret access key</span>
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={r2Form.secret_access_key}
            onChange={(e) => setR2Form((f) => ({ ...f, secret_access_key: e.target.value }))}
            placeholder={
              r2Form.secret_access_key_set
                ? r2Form.secret_access_key_hint || "•••• saved — leave blank to keep"
                : "R2 API token secret"
            }
            disabled={loading || savingR2}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Bucket</span>
          <input
            type="text"
            className={inputClass}
            value={r2Form.bucket}
            onChange={(e) => setR2Form((f) => ({ ...f, bucket: e.target.value }))}
            disabled={loading || savingR2}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Endpoint</span>
          <input
            type="url"
            className={inputClass}
            value={r2Form.endpoint}
            onChange={(e) => setR2Form((f) => ({ ...f, endpoint: e.target.value }))}
            placeholder="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
            disabled={loading || savingR2}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Region</span>
          <input
            type="text"
            className={inputClass}
            value={r2Form.region}
            onChange={(e) => setR2Form((f) => ({ ...f, region: e.target.value }))}
            disabled={loading || savingR2}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Object prefix</span>
          <input
            type="text"
            className={inputClass}
            value={r2Form.prefix}
            onChange={(e) => setR2Form((f) => ({ ...f, prefix: e.target.value }))}
            disabled={loading || savingR2}
          />
        </label>

        <label className="block text-sm lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Public / custom domain URL (optional)
          </span>
          <input
            type="url"
            className={inputClass}
            value={r2Form.public_url}
            onChange={(e) => setR2Form((f) => ({ ...f, public_url: e.target.value }))}
            placeholder="https://backups.example.com"
            disabled={loading || savingR2}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <PrimaryButton
            type="submit"
            showIcon={false}
            disabled={loading || savingR2 || testingConnection || testingUpload}
          >
            {savingR2 ? "Saving…" : "Save R2 settings"}
          </PrimaryButton>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={loading || savingR2 || testingConnection || testingUpload}
            onClick={() => void handleTestConnection()}
          >
            {testingConnection ? "Testing connection…" : "Test connection"}
          </button>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={loading || savingR2 || testingConnection || testingUpload}
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
