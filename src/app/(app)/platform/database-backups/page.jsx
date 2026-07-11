"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchBlob, apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

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

export default function PlatformDatabaseBackupsPage() {
  const confirm = useConfirm();
  const [backups, setBackups] = useState([]);
  const [r2Status, setR2Status] = useState(null);
  const [r2Form, setR2Form] = useState(emptyR2Form);
  const [loading, setLoading] = useState(true);
  const [savingR2, setSavingR2] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingUpload, setTestingUpload] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [warning, setWarning] = useState(null);
  const [busyFilename, setBusyFilename] = useState(null);
  const [creating, setCreating] = useState(false);
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while the database backup runs…");

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
      const res = await apiRequest("/admin/database-backups");
      setBackups(res.data ?? []);
      setR2Status(res.r2 ?? null);
      if (res.r2_settings) {
        applyR2Settings(res.r2_settings);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load database backups.");
    } finally {
      setLoading(false);
    }
  }, [applyR2Settings]);

  useEffect(() => {
    load();
  }, [load]);

  function r2PayloadFromForm({ includeSecretIfTyped = true } = {}) {
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
    if (includeSecretIfTyped) {
      const secret = r2Form.secret_access_key.trim();
      if (secret && !secret.startsWith("••••")) {
        body.secret_access_key = secret;
      }
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
      setR2Status((prev) => ({
        ...(prev ?? {}),
        upload_ready: Boolean(res.effective?.upload_ready),
        configured: Boolean(res.effective?.configured),
        enabled: Boolean(res.effective?.upload_ready),
        bucket: res.effective?.bucket ?? null,
        endpoint: res.effective?.endpoint ?? null,
        prefix: res.effective?.prefix ?? "backups/database",
        public_url: res.effective?.public_url ?? null,
        source: res.effective?.source ?? "platform",
        issues: [],
        setup_notes: res.effective?.upload_ready
          ? ["Backups are uploaded to Cloudflare R2 after each local dump."]
          : [],
      }));
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

  async function handleDownload(filename) {
    setBusyFilename(filename);
    try {
      const blob = await apiFetchBlob(
        `/admin/database-backups/${encodeURIComponent(filename)}/download`,
      );
      downloadBlob(blob, filename);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not download backup.");
    } finally {
      setBusyFilename(null);
    }
  }

  async function handleCreateBackup() {
    const ok = await confirm({
      title: "Run manual backup",
      message: "Run a manual database backup now? This may take a minute on large databases.",
      confirmLabel: "Run backup",
    });
    if (!ok) return;

    setCreating(true);
    setWarning(null);
    try {
      const res = await runQueuedTask(
        () =>
          apiRequest("/admin/database-backups", {
            method: "POST",
            body: {
              send_email: true,
              upload_r2: true,
            },
          }),
        {
          message: "Please wait while the database backup runs. This may take a minute on large databases…",
          timeoutMs: 3_900_000,
        },
      );
      if (res.r2_error) {
        setWarning(`Backup saved on server, but Cloudflare R2 upload failed: ${res.r2_error}`);
      } else if (res.r2_skipped_reason) {
        setWarning(`Backup saved on server. Cloudflare R2 upload was skipped: ${res.r2_skipped_reason}`);
      } else if (res.r2?.web_view_link) {
        notifySuccess(`${res.message ?? "Database backup completed."} R2 object: ${res.r2.web_view_link}`);
      } else {
        notifySuccess(res.message ?? "Database backup completed.");
      }
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Database backup failed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <CatalogPageShell
      title="Database backups"
      subtitle="Download compressed SQL dumps or trigger a manual backup. Super-admin only."
      action={
        <PrimaryButton type="button" showIcon={false} disabled={creating} onClick={handleCreateBackup}>
          {creating ? "Running backup…" : "Run manual backup"}
        </PrimaryButton>
      }
    >
      <AdminBreadcrumb
        items={[{ label: "Platform", href: "/platform" }, { label: "Database backups" }]}
      />

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Scheduled backups run daily via the API server cron job. Files are stored on the server
        {r2Status?.upload_ready
          ? " and uploaded to Cloudflare R2 after each backup."
          : "."}
        {" "}
        Local backups older than 7 days are deleted automatically after each backup run.
        {" "}
        Large files may be emailed as a notification only (without attachment).
      </div>

      <section className="theme-panel mt-4 rounded-xl border p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Cloudflare R2 offsite upload</h2>
            <p className="mt-1 text-xs text-slate-500">
              Configure R2 credentials here. After each local dump, the backup is copied to your R2 bucket.
              Leave the secret blank to keep the current value.
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
            <PrimaryButton type="submit" showIcon={false} disabled={loading || savingR2 || testingConnection || testingUpload}>
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
              {testResult.detail ? <p className="mt-1 break-all font-mono text-xs opacity-90">{testResult.detail}</p> : null}
            </div>
          ) : null}
        </form>
      </section>

      {warning ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {warning}
        </p>
      ) : null}

      <div className="mt-6 theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Available backups</h2>
          <p className="mt-1 text-sm text-slate-500">
            Newest first. Download a file to restore or archive it locally. Fresh backups are
            sanitized for MySQL generated columns (e.g. <code>balance_due</code>) so Workbench import
            does not fail with ERROR 3105. If you have an older dump that fails on import, gunzip it
            then run:{" "}
            <code className="text-xs">php artisan erp:sanitize-database-dump /path/to/file.sql</code>
            {" "}and import the sanitized file.
          </p>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading backups…</p>
        ) : backups.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">
            No backup files found yet. Use &ldquo;Run manual backup&rdquo; or wait for the nightly job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">File</th>
                  <th className="px-5 py-3">Size</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.map((backup) => (
                  <tr key={backup.filename}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-800">{backup.filename}</td>
                    <td className="px-5 py-3 text-slate-600">{formatBytes(backup.size_bytes)}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(backup.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyFilename === backup.filename}
                        onClick={() => handleDownload(backup.filename)}
                        className="text-sm font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                      >
                        {busyFilename === backup.filename ? "Downloading…" : "Download"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {overlayNode}
    </CatalogPageShell>
  );
}
