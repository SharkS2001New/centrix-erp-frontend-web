"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchBlob, apiRequest, apiRequestMultipart, ApiError } from "@/lib/api";
import { useQueuedTask } from "@/lib/use-queued-task";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SearchableSelect,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";

/** Fallback if API has not returned restore_datasets yet. */
const FALLBACK_RESTORE_DATASETS = [
  {
    id: "hr_attendance",
    label: "HR attendance (day + clock sessions)",
    description:
      "Employee day sheets and clock in/out sessions — what the Attendance screen shows for staff.",
    recommended_mode: "merge",
    available_tables: ["employee_attendance", "employee_clock_sessions"],
  },
  {
    id: "hr_attendance_with_punches",
    label: "HR attendance + device punches",
    description:
      "Day sheets, clock sessions, and raw Hikvision access events (for forgotten clock-out checks).",
    recommended_mode: "merge",
    available_tables: [
      "employee_attendance",
      "employee_clock_sessions",
      "hikvision_access_events",
    ],
  },
];

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
  const [restoring, setRestoring] = useState(false);
  const [restoreMode, setRestoreMode] = useState("merge");
  const [restoreDatasets, setRestoreDatasets] = useState(FALLBACK_RESTORE_DATASETS);
  const [selectedDatasetId, setSelectedDatasetId] = useState("hr_attendance");
  const [selectedTables, setSelectedTables] = useState([
    "employee_attendance",
    "employee_clock_sessions",
  ]);
  const [restoreFile, setRestoreFile] = useState(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [showAdvancedTables, setShowAdvancedTables] = useState(false);
  const [customTables, setCustomTables] = useState("");
  const { runQueuedTask, overlayNode } = useQueuedTask("Please wait while the database backup runs…");

  function parseTablesInput(raw) {
    const parts = String(raw || "")
      .split(/[\s,]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return parts.length ? parts : null;
  }

  function applyDataset(dataset) {
    if (!dataset) {
      setSelectedDatasetId("");
      setSelectedTables([]);
      return;
    }
    setSelectedDatasetId(dataset.id);
    setSelectedTables([...(dataset.available_tables ?? dataset.tables ?? [])]);
    if (dataset.recommended_mode) {
      setRestoreMode(dataset.recommended_mode);
    }
    setCustomTables("");
    setShowAdvancedTables(false);
  }

  function toggleTable(table) {
    setSelectedTables((prev) => {
      const set = new Set(prev);
      if (set.has(table)) set.delete(table);
      else set.add(table);
      return [...set];
    });
    setSelectedDatasetId("");
  }

  function resolveRestoreTables() {
    const custom = parseTablesInput(customTables);
    if (custom) return custom;
    return selectedTables.length ? selectedTables : null;
  }

  const applySchedule = useCallback((payload) => {
    const settings = payload?.settings ?? payload?.effective ?? {};
    setSchedule(payload);
    setScheduleForm({
      schedule_enabled: settings.enabled !== false,
      frequency: settings.frequency || "daily",
      schedule_time: settings.schedule_time || "02:00",
      retention_days: String(settings.retention_days ?? 3),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/database-backups");
      setBackups(res.data ?? []);
      setR2Status(res.r2 ?? null);
      if (res.schedule) applySchedule(res.schedule);
      if (Array.isArray(res.restore_datasets) && res.restore_datasets.length > 0) {
        setRestoreDatasets(res.restore_datasets);
      }
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
          retention_days: Number(scheduleForm.retention_days) || 3,
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

  async function handleRestoreFromBackup(filename) {
    const tables = resolveRestoreTables();
    const isFull = !tables;
    if (!isFull && tables.length === 0) {
      notifyError("Select at least one table, or choose Full database.");
      return;
    }
    if (selectedDatasetId && isFull) {
      notifyError("That pack has no tables selected. Tick at least one table, or choose Full database.");
      return;
    }
    if (isFull && restoreMode === "replace" && !confirmFull) {
      notifyError("Check “I understand this will replace the full database” before a full replace.");
      return;
    }
    const datasetLabel =
      restoreDatasets.find((d) => d.id === selectedDatasetId)?.label || selectedDatasetId || null;
    const ok = await confirm({
      title: "Restore from backup?",
      message: isFull
        ? `Apply the full dump from ${filename} using ${restoreMode} mode.${
            restoreMode === "replace"
              ? "\n\nReplace will overwrite matching tables from the dump."
              : "\n\nMerge inserts missing rows (INSERT IGNORE) and skips DROP/TRUNCATE."
          }`
        : `Restore${datasetLabel ? ` “${datasetLabel}”` : ""} (${tables.join(", ")}) from ${filename} using ${
            restoreMode === "replace" ? "replace (truncate then load)" : "merge (insert ignore)"
          }.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;

    setRestoring(true);
    setBusyFilename(filename);
    try {
      const res = await apiRequest(`/admin/database-backups/${encodeURIComponent(filename)}/restore`, {
        method: "POST",
        body: {
          mode: restoreMode,
          dataset: selectedDatasetId || undefined,
          tables: tables ?? undefined,
          confirm_full: Boolean(isFull && restoreMode === "replace" && confirmFull),
        },
      });
      notifySuccess(res.message ?? "Restore completed.");
    } catch (e) {
      notifyError(
        e instanceof ApiError
          ? e.data?.detail || e.message
          : "Database restore failed.",
      );
    } finally {
      setRestoring(false);
      setBusyFilename(null);
    }
  }

  async function handleRestoreUpload(e) {
    e.preventDefault();
    if (!restoreFile) {
      notifyError("Choose a .sql or .sql.gz file first.");
      return;
    }
    const tables = resolveRestoreTables();
    const isFull = !tables;
    if (selectedDatasetId && isFull) {
      notifyError("That pack has no tables selected. Tick at least one table, or choose Full database.");
      return;
    }
    if (isFull && restoreMode === "replace" && !confirmFull) {
      notifyError("Check “I understand this will replace the full database” before a full replace.");
      return;
    }
    const datasetLabel =
      restoreDatasets.find((d) => d.id === selectedDatasetId)?.label || selectedDatasetId || null;
    const ok = await confirm({
      title: "Restore uploaded dump?",
      message: isFull
        ? `Apply ${restoreFile.name} as a full dump (${restoreMode}).`
        : `Restore${datasetLabel ? ` “${datasetLabel}”` : ""} (${tables.join(", ")}) from ${restoreFile.name} (${restoreMode}).`,
      confirmLabel: "Restore upload",
    });
    if (!ok) return;

    setRestoring(true);
    try {
      const res = await apiRequestMultipart("/admin/database-backups/restore-upload", {
        file: restoreFile,
        mode: restoreMode,
        dataset: selectedDatasetId || "",
        tables: tables ? JSON.stringify(tables) : "",
        confirm_full: isFull && restoreMode === "replace" && confirmFull ? "1" : "0",
      });
      notifySuccess(res.message ?? "Restore completed.");
      setRestoreFile(null);
    } catch (err) {
      notifyError(
        err instanceof ApiError
          ? err.data?.detail || err.message
          : "Database restore failed.",
      );
    } finally {
      setRestoring(false);
    }
  }

  const scheduleLabel = schedule?.effective?.label || "Daily (default)";
  const retentionDays = schedule?.effective?.retention_days ?? 3;

  return (
    <CatalogPageShell
      title="Database backups"
      subtitle="Scheduled snapshots, downloads, manual runs, and table/full restore. Super-admin only."
      action={
        <PrimaryButton type="button" showIcon={false} disabled={creating || restoring} onClick={handleCreateBackup}>
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
        backup. R2 SQL dump retention is configured separately under{" "}
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
          Default is 3 days — older local backups are deleted automatically after each run. R2 offsite
          retention (default 7 days) is set under Platform settings → Cloudflare R2.
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
          {r2Status.retention_days ? (
            <>
              {" "}
              · keep SQL dumps {r2Status.retention_days} day
              {r2Status.retention_days === 1 ? "" : "s"}
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

      <form
        onSubmit={(e) => void handleRestoreUpload(e)}
        className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-900">Restore</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pick what you need (e.g. HR attendance) — Centrix selects the related tables for you.
          Prefer <strong>Merge</strong> to fill missing rows without wiping newer data.
        </p>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-slate-600">What do you want to restore?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {restoreDatasets.map((dataset) => {
              const active = selectedDatasetId === dataset.id;
              const tableCount = (dataset.available_tables ?? dataset.tables ?? []).length;
              return (
                <button
                  key={dataset.id}
                  type="button"
                  disabled={restoring || tableCount === 0}
                  onClick={() => applyDataset(dataset)}
                  className={`rounded-lg border px-3 py-3 text-left transition ${
                    active
                      ? "border-[#185FA5] bg-[#185FA5]/[0.06] ring-1 ring-[#185FA5]/40"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  } disabled:opacity-50`}
                >
                  <span className="block text-sm font-medium text-slate-900">{dataset.label}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                    {dataset.description}
                  </span>
                  <span className="mt-2 block font-mono text-[10px] text-slate-400">
                    {(dataset.available_tables ?? dataset.tables ?? []).join(", ") || "tables missing"}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              disabled={restoring}
              onClick={() => {
                setSelectedDatasetId("");
                setSelectedTables([]);
                setCustomTables("");
                setShowAdvancedTables(true);
              }}
              className={`rounded-lg border px-3 py-3 text-left transition ${
                !selectedDatasetId && selectedTables.length === 0 && !customTables
                  ? "border-[#185FA5] bg-[#185FA5]/[0.06] ring-1 ring-[#185FA5]/40"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-sm font-medium text-slate-900">Full database</span>
              <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                Entire dump — only use when you really need everything. Replace requires an extra
                confirmation.
              </span>
            </button>
          </div>
        </div>

        {(selectedTables.length > 0 || selectedDatasetId) && (
          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-600">Tables included (untick to exclude)</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {selectedTables.map((table) => (
                <label key={table} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked
                    disabled={restoring}
                    onChange={() => toggleTable(table)}
                  />
                  <span className="font-mono">{table}</span>
                </label>
              ))}
            </div>
            {selectedDatasetId && (
              <p className="mt-2 text-[11px] text-slate-500">
                Pack: <span className="font-medium text-slate-700">{selectedDatasetId}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Mode</span>
            <SearchableSelect
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={restoreMode}
              nativeEvent
              onChange={(e) => setRestoreMode(e.target.value)}
              options={[
                { value: "merge", label: "Merge (insert ignore / keep existing)" },
                { value: "replace", label: "Replace (truncate then load)" },
              ]}
            />
          </label>
          <div className="block text-sm">
            <button
              type="button"
              className="mb-1 text-xs font-medium text-[#185FA5] hover:underline"
              onClick={() => setShowAdvancedTables((v) => !v)}
            >
              {showAdvancedTables ? "Hide custom table list" : "Advanced: type table names"}
            </button>
            {showAdvancedTables ? (
              <input
                type="text"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                value={customTables}
                onChange={(e) => {
                  setCustomTables(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedDatasetId("");
                    setSelectedTables([]);
                  }
                }}
                placeholder="table_a,table_b"
                disabled={restoring}
              />
            ) : (
              <p className="text-[11px] text-slate-500">
                Usually you only need a pack above — custom names are optional.
              </p>
            )}
          </div>
        </div>
        {restoreMode === "replace" && !resolveRestoreTables() ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-rose-800">
            <input
              type="checkbox"
              checked={confirmFull}
              onChange={(e) => setConfirmFull(e.target.checked)}
            />
            I understand this will replace the full database from the dump
          </label>
        ) : null}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Upload .sql / .sql.gz</span>
            <input
              type="file"
              accept=".sql,.gz,.sql.gz,application/gzip,application/sql,text/plain"
              className="block w-full max-w-md text-sm"
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              disabled={restoring}
            />
          </label>
          <PrimaryButton type="submit" showIcon={false} disabled={restoring || !restoreFile}>
            {restoring ? "Restoring…" : "Restore upload"}
          </PrimaryButton>
        </div>
      </form>

      <div className="mt-6 theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Available backups</h2>
          <p className="mt-1 text-sm text-slate-500">
            Newest first. Download or restore using the mode/tables above. Fresh backups are
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
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          disabled={restoring || busyFilename === backup.filename}
                          onClick={() => void handleRestoreFromBackup(backup.filename)}
                          className="text-sm font-medium text-amber-800 hover:underline disabled:opacity-50"
                        >
                          {busyFilename === backup.filename && restoring ? "Restoring…" : "Restore"}
                        </button>
                        <button
                          type="button"
                          disabled={busyFilename === backup.filename}
                          onClick={() => handleDownload(backup.filename)}
                          className="text-sm font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                        >
                          {busyFilename === backup.filename && !restoring ? "Downloading…" : "Download"}
                        </button>
                      </div>
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
