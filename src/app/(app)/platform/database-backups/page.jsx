"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchBlob, apiRequest, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SearchableSelect,
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
  const [schedule, setSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    schedule_enabled: true,
    frequency: "hourly",
    schedule_time: "02:00",
    retention_days: "3",
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState(null);
  const [busyFilename, setBusyFilename] = useState(null);
  const [creating, setCreating] = useState(false);
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while the database backup runs…");

  const applySchedule = useCallback((payload) => {
    const settings = payload?.settings ?? payload?.effective ?? {};
    setSchedule(payload);
    setScheduleForm({
      schedule_enabled: settings.enabled !== false,
      frequency: settings.frequency || "daily",
      schedule_time: settings.schedule_time || "02:00",
      retention_days: String(settings.retention_days ?? 7),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/database-backups");
      setBackups(res.data ?? []);
      setR2Status(res.r2 ?? null);
      if (res.schedule) applySchedule(res.schedule);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load database backups.");
    } finally {
      setLoading(false);
    }
  }, [applySchedule]);

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

  async function handleSaveSchedule(e) {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      const res = await apiRequest("/admin/database-backup-settings", {
        method: "PUT",
        body: {
          schedule_enabled: Boolean(scheduleForm.schedule_enabled),
          frequency: scheduleForm.frequency,
          schedule_time: scheduleForm.schedule_time,
          retention_days: Number(scheduleForm.retention_days) || 7,
        },
      });
      if (res.schedule) applySchedule(res.schedule);
      notifySuccess("Backup schedule saved. The next scheduler tick will use this cadence.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save backup schedule.");
    } finally {
      setSavingSchedule(false);
    }
  }

  const scheduleLabel = schedule?.effective?.label || "Daily (default)";
  const retentionDays = schedule?.effective?.retention_days ?? 7;

  return (
    <CatalogPageShell
      title="Database backups"
      subtitle="Scheduled snapshots, downloads, and manual runs. Super-admin only."
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
        Scheduled backups currently run <strong>{scheduleLabel}</strong> via the API cron job.
        Files stay on the server
        {r2Status?.upload_ready ? " and are copied to Cloudflare R2 after each run." : "."} Local
        files older than {retentionDays} day{retentionDays === 1 ? "" : "s"} are pruned after each
        backup. Configure offsite upload in{" "}
        <Link href="/platform/settings?tab=r2" className="font-medium text-[#185FA5] hover:underline">
          Platform settings → Cloudflare R2
        </Link>
        .
      </div>

      <form
        onSubmit={(e) => void handleSaveSchedule(e)}
        className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Backup schedule</h2>
            <p className="mt-1 text-xs text-slate-500">
              How often Centrix snapshots the database. Hourly is recommended so a failure loses at
              most ~1 hour of data. The scheduler must be running (`php artisan schedule:run` every
              minute).
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scheduleForm.schedule_enabled}
              onChange={(e) =>
                setScheduleForm((f) => ({ ...f, schedule_enabled: e.target.checked }))
              }
            />
            Scheduled backups on
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Frequency</span>
            <SearchableSelect
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={scheduleForm.frequency}
              nativeEvent
              onChange={(e) => setScheduleForm((f) => ({ ...f, frequency: e.target.value }))}
              options={[
                { value: "hourly", label: "Every hour" },
                { value: "every_6_hours", label: "Every 6 hours" },
                { value: "every_12_hours", label: "Every 12 hours" },
                { value: "daily", label: "Once per day" },
              ]}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {scheduleForm.frequency === "daily" ? "Time (local)" : "Minute past the hour"}
            </span>
            <input
              type="time"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={scheduleForm.schedule_time}
              onChange={(e) => setScheduleForm((f) => ({ ...f, schedule_time: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Keep local files (days)</span>
            <input
              type="number"
              min={1}
              max={90}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={scheduleForm.retention_days}
              onChange={(e) => setScheduleForm((f) => ({ ...f, retention_days: e.target.value }))}
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Hourly snapshots grow quickly — 2–3 days of retention is usually enough if R2 offsite is on.
        </p>
        <div className="mt-3">
          <PrimaryButton type="submit" showIcon={false} disabled={savingSchedule || loading}>
            {savingSchedule ? "Saving…" : "Save schedule"}
          </PrimaryButton>
        </div>
      </form>

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
            No backup files found yet. Use &ldquo;Run manual backup&rdquo; or wait for the next scheduled run.
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
