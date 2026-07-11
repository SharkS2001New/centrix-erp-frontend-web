"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchBlob, apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";

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

export default function PlatformDatabaseBackupsPage() {
  const confirm = useConfirm();
  const [backups, setBackups] = useState([]);
  const [r2Status, setR2Status] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState(null);
  const [busyFilename, setBusyFilename] = useState(null);
  const [creating, setCreating] = useState(false);
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while the database backup runs…");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/database-backups");
      setBackups(res.data ?? []);
      setR2Status(res.r2 ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load database backups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        {" "}
        Configure offsite upload in{" "}
        <Link href="/platform/settings?tab=r2" className="font-medium text-[#185FA5] hover:underline">
          Platform settings → Cloudflare R2
        </Link>
        .
      </div>

      {r2Status?.upload_ready ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          R2 offsite upload is active
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
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          R2 offsite upload is not configured. Set credentials under{" "}
          <Link href="/platform/settings?tab=r2" className="font-medium text-amber-950 underline">
            Platform settings → Cloudflare R2
          </Link>
          .
        </div>
      )}

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
