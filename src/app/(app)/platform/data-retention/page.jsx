"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { apiRequest, ApiError, operationalPruneStream } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";

function labelForKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function LivePruneLogModal({ open, busy, title, logs, logEndRef, onClose }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-prune-log-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 id="live-prune-log-title" className="text-base font-semibold text-white">
              {title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {busy
                ? "Streaming each delete / optimize step…"
                : logs.length
                  ? `${logs.length} line(s) · run finished`
                  : "Waiting for output…"}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onClose}
            disabled={busy}
            title={busy ? "Wait until the run finishes" : "Close"}
          >
            {busy ? "Running…" : "Close"}
          </button>
        </div>
        <div className="min-h-[240px] flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-slate-500">Waiting for a run…</p>
          ) : (
            logs.map((line) => (
              <div
                key={line.id}
                className={
                  line.tone === "error"
                    ? "text-rose-300"
                    : line.tone === "ok"
                      ? "text-emerald-300"
                      : "text-slate-200"
                }
              >
                <span className="mr-2 text-slate-500">[{line.at}]</span>
                {line.message}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

const RETENTION_FIELDS = [
  {
    key: "hikvision_access_events_days",
    label: "Hikvision events / missed punches",
    hint: "Days to keep raw punches & forgotten alerts for reconciliation",
    min: 1,
    max: 90,
  },
  {
    key: "attendance_days",
    label: "Attendance + clock sessions",
    hint: "Day-level attendance kept after the date (min 30)",
    min: 30,
    max: 365,
  },
  {
    key: "hikvision_agent_commands_completed_days",
    label: "Hikvision commands (completed)",
    hint: "Leftover completed device command payloads",
    min: 1,
    max: 90,
  },
  {
    key: "hikvision_agent_commands_failed_days",
    label: "Hikvision commands (failed / expired)",
    min: 1,
    max: 90,
  },
  {
    key: "kra_agent_commands_completed_days",
    label: "KRA commands (completed)",
    hint: "Aligned with Hikvision by default so agent junk does not pile up",
    min: 1,
    max: 90,
  },
  {
    key: "kra_agent_commands_failed_days",
    label: "KRA commands (failed / expired)",
    min: 1,
    max: 90,
  },
  {
    key: "released_stock_reservations_days",
    label: "Released stock reservations",
    min: 1,
    max: 90,
  },
  {
    key: "audit_logs_days",
    label: "Audit logs",
    min: 1,
    max: 90,
  },
  {
    key: "cancelled_sales_days",
    label: "Cancelled orders (hard delete)",
    min: 1,
    max: 90,
  },
  {
    key: "expired_sales_days",
    label: "Expired orders (hard delete)",
    min: 1,
    max: 90,
  },
];

function defaultForm(retention = {}) {
  const form = {
    prune_time: retention.prune_time || "03:40",
  };
  for (const field of RETENTION_FIELDS) {
    form[field.key] = String(retention[field.key] ?? "");
  }
  return form;
}

export default function PlatformDataRetentionPage() {
  const confirm = useConfirm();
  const logEndRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(null);
  const [status, setStatus] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [optimizeTables, setOptimizeTables] = useState(true);
  const [form, setForm] = useState(() => defaultForm());
  const [runLogs, setRunLogs] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [logTitle, setLogTitle] = useState("Live prune log");
  const [oneOffDays, setOneOffDays] = useState("7");
  const [maxRows, setMaxRows] = useState("25000");
  const [tableDays, setTableDays] = useState({});
  const [pruningTable, setPruningTable] = useState(null);

  const appendLog = useCallback((message, tone = "info") => {
    if (!message) return;
    setRunLogs((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, at: stamp(), message, tone }]);
  }, []);

  const openLog = useCallback((title) => {
    setLogTitle(title || "Live prune log");
    setLogOpen(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/operational-prune");
      setStatus(res);
      setForm(defaultForm(res?.retention ?? {}));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load retention status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [runLogs, logOpen]);

  async function saveSettings(e) {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const body = {
        prune_time: form.prune_time || "03:40",
      };
      for (const field of RETENTION_FIELDS) {
        const n = Number(form[field.key]);
        if (Number.isFinite(n)) body[field.key] = n;
      }
      const res = await apiRequest("/admin/operational-prune/settings", {
        method: "PUT",
        body,
      });
      setStatus(res);
      setForm(defaultForm(res?.retention ?? {}));
      notifySuccess("Retention timers saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function pruneTargetForTable(tableName) {
    if (tableName === "employee_clock_sessions") return "employee_attendance";
    const allowed = new Set([
      "hikvision_agent_commands",
      "hikvision_access_events",
      "employee_attendance",
      "kra_agent_commands",
      "stock_reservations",
      "audit_logs",
    ]);
    return allowed.has(tableName) ? tableName : null;
  }

  async function runPrune({ dryRun, targets = null, days = null, rowLimit = null }) {
    const daysLabel =
      days != null ? `older than ${days} day(s)` : "older than the saved retention timers";
    const limitLabel = rowLimit != null ? `\nMax rows this run: ${rowLimit.toLocaleString()}` : "";
    const targetLabel = targets?.length ? `\n\nTables: ${targets.join(", ")}` : "";
    const ok = await confirm({
      title: dryRun ? "Preview prune?" : "Delete old data now?",
      message: dryRun
        ? `Counts rows ${daysLabel}.${limitLabel}${targetLabel}\nNothing is removed. A live log popup shows each step.`
        : `Deletes data ${daysLabel}.${limitLabel}${targetLabel}${
            optimizeTables
              ? "\n\nOPTIMIZE TABLE will run afterward (may lock briefly)."
              : ""
          }\n\nProof of run = Live prune log popup (“Deleted N …”), not the MB column alone.`,
      confirmLabel: dryRun ? "Preview" : "Delete",
    });
    if (!ok) return;

    setRunning(true);
    if (targets?.length === 1) setPruningTable(targets[0]);
    setRunLogs([]);
    openLog(dryRun ? "Live prune log — dry run" : "Live prune log");
    appendLog(dryRun ? "Starting dry run…" : "Starting operational prune…", "info");

    try {
      const body = {
        dry_run: dryRun,
        optimize_tables: !dryRun && optimizeTables,
      };
      if (days != null) body.days = days;
      if (rowLimit != null) body.max_rows = rowLimit;
      if (targets?.length) body.targets = targets;

      const done = await operationalPruneStream(body, {
        onEvent: (event) => {
          if (event?.message) {
            const tone =
              event.event === "error"
                ? "error"
                : event.phase === "done" && event.event === "step"
                  ? "ok"
                  : "info";
            appendLog(event.message, tone);
          }
        },
      });

      if (done) {
        setLastResult(done);
        if (done.status) {
          setStatus(done.status);
          setForm(defaultForm(done.status?.retention ?? {}));
        }
      }
      notifySuccess(
        dryRun
          ? `Would delete ${done?.total ?? 0} rows across retention tables.`
          : `Pruned ${done?.total ?? 0} rows${
              (done?.optimized_tables ?? []).length
                ? `; optimized ${(done?.optimized_tables ?? []).length} tables`
                : ""
            }.`,
      );
    } catch (err) {
      appendLog(err instanceof ApiError ? err.message : "Prune failed.", "error");
      notifyError(err instanceof ApiError ? err.message : "Prune failed.");
    } finally {
      setRunning(false);
      setPruningTable(null);
    }
  }

  async function deleteTableOlderThan(tableName) {
    const target = pruneTargetForTable(tableName);
    if (!target) {
      notifyError("This table cannot be pruned from here.");
      return;
    }
    const days = Number(tableDays[tableName] ?? oneOffDays);
    const rowLimit = Number(maxRows);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      notifyError("Enter days between 1 and 365.");
      return;
    }
    await runPrune({
      dryRun: false,
      targets: [target],
      days,
      rowLimit: Number.isFinite(rowLimit) && rowLimit > 0 ? rowLimit : null,
    });
  }

  async function optimizeTable(tableName) {
    const ok = await confirm({
      title: `Optimize ${tableName}?`,
      message:
        "Runs OPTIMIZE TABLE to reclaim disk after deletes. May lock this table briefly — prefer off-peak hours for large tables. Progress shows in the live log popup.",
      confirmLabel: "Optimize",
    });
    if (!ok) return;

    setOptimizing(tableName);
    setRunLogs([]);
    openLog(`Live prune log — OPTIMIZE ${tableName}`);
    appendLog(`Starting OPTIMIZE TABLE \`${tableName}\`…`, "info");
    try {
      const done = await operationalPruneStream(
        { optimize_only: true, tables: [tableName] },
        {
          onEvent: (event) => {
            if (event?.message) {
              appendLog(event.message, event.event === "error" ? "error" : "ok");
            }
          },
        },
      );
      if (done?.status) {
        setStatus(done.status);
        setForm(defaultForm(done.status?.retention ?? {}));
      }
      notifySuccess(`Optimized ${tableName}.`);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? "Optimize API route is missing. Redeploy/restart the backend (php artisan route:clear), then retry."
          : err instanceof ApiError
            ? err.message
            : "Optimize failed.";
      appendLog(message, "error");
      notifyError(message);
    } finally {
      setOptimizing(null);
    }
  }

  async function optimizeAllTables() {
    const ok = await confirm({
      title: "Optimize all retention tables?",
      message:
        "Runs OPTIMIZE TABLE on every listed table. Can take several minutes and briefly lock large tables. Live log popup shows each table as it finishes.",
      confirmLabel: "Optimize all",
    });
    if (!ok) return;

    setOptimizing("all");
    setRunLogs([]);
    openLog("Live prune log — OPTIMIZE all");
    appendLog("Starting OPTIMIZE on all retention tables…", "info");
    try {
      const done = await operationalPruneStream(
        { optimize_only: true },
        {
          onEvent: (event) => {
            if (event?.message) {
              appendLog(event.message, event.event === "error" ? "error" : "ok");
            }
          },
        },
      );
      if (done?.status) {
        setStatus(done.status);
        setForm(defaultForm(done.status?.retention ?? {}));
      }
      notifySuccess(`Optimized ${(done?.optimized_tables ?? []).length} tables.`);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? "Optimize API route is missing. Redeploy/restart the backend (php artisan route:clear), then retry."
          : err instanceof ApiError
            ? err.message
            : "Optimize failed.";
      appendLog(message, "error");
      notifyError(message);
    } finally {
      setOptimizing(null);
    }
  }

  const tables = status?.tables ?? [];
  const deleted = lastResult?.deleted ?? null;
  const busy = loading || running || saving || Boolean(optimizing) || Boolean(pruningTable);
  const logBusy = running || Boolean(optimizing);
  const scheduleTime = status?.schedule_time || form.prune_time || "03:40";
  const scheduleTz = status?.schedule_timezone || "Africa/Nairobi";
  const scheduler = status?.scheduler ?? null;
  const lastRun = status?.last_run ?? null;
  const lastRunSource =
    lastRun?.source === "schedule"
      ? "Nightly schedule"
      : lastRun?.source === "cli"
        ? "CLI"
        : lastRun?.source
          ? "Manual"
          : null;

  return (
    <CatalogPageShell
      title="Data retention"
      subtitle={`Set prune timers, reclaim disk on large tables, and run the same cleanup as nightly erp:prune-operational-data (${scheduleTime} ${scheduleTz}). Live logs open in a popup.`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Older than
            <input
              type="number"
              min={1}
              max={365}
              className="w-16 rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={oneOffDays}
              onChange={(e) => setOneOffDays(e.target.value)}
              disabled={busy}
            />
            days
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Max rows
            <input
              type="number"
              min={1}
              max={500000}
              className="w-24 rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={maxRows}
              onChange={(e) => setMaxRows(e.target.value)}
              disabled={busy}
              title="Caps how many rows this run deletes"
            />
          </label>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void load()}
            disabled={busy}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          {runLogs.length > 0 ? (
            <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => openLog(logTitle)}>
              Show log
            </button>
          ) : null}
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => {
              const days = Number(oneOffDays);
              const rowLimit = Number(maxRows);
              void runPrune({
                dryRun: true,
                days: Number.isFinite(days) ? days : null,
                rowLimit: Number.isFinite(rowLimit) && rowLimit > 0 ? rowLimit : null,
              });
            }}
            disabled={busy}
          >
            Preview (dry run)
          </button>
          <PrimaryButton
            type="button"
            onClick={() => {
              const days = Number(oneOffDays);
              const rowLimit = Number(maxRows);
              void runPrune({
                dryRun: false,
                days: Number.isFinite(days) ? days : null,
                rowLimit: Number.isFinite(rowLimit) && rowLimit > 0 ? rowLimit : null,
              });
            }}
            disabled={busy}
          >
            {running && !pruningTable ? "Running…" : "Delete older than N"}
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Data retention" },
        ]}
      />

      <LivePruneLogModal
        open={logOpen}
        busy={logBusy}
        title={logTitle}
        logs={runLogs}
        logEndRef={logEndRef}
        onClose={() => setLogOpen(false)}
      />

      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Nightly automation</h2>
            <p className="mt-1 text-xs text-slate-500">
              Runs <code className="rounded bg-slate-100 px-1">erp:prune-operational-data</code> at{" "}
              <strong>{scheduleTime}</strong> ({scheduleTz}) using the timers below.
            </p>
          </div>
          <Link href="/platform/health" className="text-sm font-medium text-[#185FA5] hover:underline">
            Infra health →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Scheduler</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {scheduler?.ok ? (
                <span className="text-emerald-700">Running</span>
              ) : (
                <span className="text-amber-800">Not detected</span>
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {scheduler?.detail || "Refresh after cron is configured."}
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Last prune</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatWhen(lastRun?.finished_at)}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {lastRun
                ? `${lastRunSource}${lastRun.dry_run ? " · dry run" : ""} · ${Number(lastRun.total ?? 0).toLocaleString()} rows`
                : "No recorded run yet — wait for tonight or run Delete once."}
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Proof</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {lastRun?.source === "schedule" ? "Schedule fired" : lastRun ? "Manual/CLI only" : "Pending"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Server log:{" "}
              <code className="rounded bg-white px-1">storage/logs/prune-operational-data.log</code>
            </p>
          </div>
        </div>
        {!scheduler?.ok ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Cron must call <code className="rounded bg-white px-1">php artisan schedule:run</code> every
            minute, or the nightly prune will never start. Check{" "}
            <Link href="/platform/health" className="font-medium underline">
              Infrastructure health
            </Link>
            .
          </p>
        ) : null}
      </section>

      <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={optimizeTables}
          onChange={(e) => setOptimizeTables(e.target.checked)}
          disabled={busy}
        />
        <span>
          After prune, run <span className="font-medium">OPTIMIZE TABLE</span> on retention tables
          to reclaim disk space (recommended after a large cleanup).
        </span>
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Retention windows</h2>
          <p className="mt-1 text-xs text-slate-500">
            Nightly schedule uses these timers ({scheduleTz}).
          </p>
          <form className="mt-3 space-y-3" onSubmit={(e) => void saveSettings(e)}>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">Prune time</span>
              <input
                type="time"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.prune_time}
                onChange={(e) => setForm((f) => ({ ...f, prune_time: e.target.value }))}
                disabled={busy}
              />
            </label>
            {RETENTION_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">{field.label}</span>
                  <span className="text-[11px] text-slate-400">days</span>
                </span>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={form[field.key]}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  disabled={busy}
                />
                {field.hint ? <span className="mt-1 block text-[11px] text-slate-500">{field.hint}</span> : null}
              </label>
            ))}
            <PrimaryButton type="submit" showIcon={false} disabled={busy}>
              {saving ? "Saving…" : "Save timers"}
            </PrimaryButton>
          </form>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Delete / optimize by table</h2>
              <p className="mt-1 text-xs text-slate-500">
                MB is estimated and often unchanged until many rows are deleted then OPTIMIZE. Use the
                log popup for proof.
              </p>
            </div>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              onClick={() => void optimizeAllTables()}
              disabled={busy || tables.length === 0}
            >
              {optimizing === "all" ? "Optimizing…" : "Optimize all"}
            </button>
          </div>
          {loading && !tables.length ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Table</th>
                    <th className="py-2 pr-3 font-medium text-right">MB</th>
                    <th className="py-2 pr-3 font-medium text-right">Rows</th>
                    <th className="py-2 pr-3 font-medium text-right">Older than</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((row) => {
                    const target = pruneTargetForTable(row.name);
                    const daysValue = tableDays[row.name] ?? oneOffDays;
                    return (
                      <tr key={row.name} className="border-b border-slate-50 align-top">
                        <td className="py-2 pr-3">
                          <div className="font-mono text-xs text-slate-800">{row.name}</div>
                          {row.note ? (
                            <p className="mt-1 max-w-xs text-[11px] leading-snug text-slate-500">{row.note}</p>
                          ) : null}
                          {row.prunable_rows != null ? (
                            <p className="mt-0.5 text-[11px] text-amber-800">
                              Prunable now: {Number(row.prunable_rows).toLocaleString()}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{row.mb}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                          {Number(row.rows || 0).toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          {target ? (
                            <input
                              type="number"
                              min={1}
                              max={365}
                              className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                              value={daysValue}
                              onChange={(e) =>
                                setTableDays((prev) => ({ ...prev, [row.name]: e.target.value }))
                              }
                              disabled={busy}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {target ? (
                              <button
                                type="button"
                                className={SECONDARY_BTN_CLASS}
                                onClick={() => void deleteTableOlderThan(row.name)}
                                disabled={busy}
                              >
                                {pruningTable === target ? "…" : "Delete"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={SECONDARY_BTN_CLASS}
                              onClick={() => void optimizeTable(row.name)}
                              disabled={busy}
                            >
                              {optimizing === row.name ? "…" : "Optimize"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {(status?.notes ?? []).length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-slate-500">
              {(status?.notes ?? []).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">
              Delete old rows first, then Optimize. Empty tables (e.g. hikvision_agent_commands at 0 MB)
              will not shrink further.
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            CLI:{" "}
            <code className="rounded bg-slate-100 px-1">
              php artisan erp:prune-operational-data --only=stock_reservations --days=1 --limit=25000
              --optimize
            </code>
          </p>
        </section>
      </div>

      {deleted ? (
        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {lastResult?.dry_run ? "Preview results" : "Last run results"}
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(deleted).map(([key, count]) => (
              <li
                key={key}
                className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="text-slate-700">{labelForKey(key)}</span>
                <span className="font-medium tabular-nums">{Number(count).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          {(lastResult?.optimize_results ?? []).length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              {(lastResult.optimize_results ?? []).map((row) => (
                <li key={row.name}>
                  {row.name}: {row.before_mb} → {row.after_mb} MB
                  {row.delta_mb > 0 ? ` (−${row.delta_mb})` : " (no reclaim)"}
                </li>
              ))}
            </ul>
          ) : (lastResult?.optimized_tables ?? []).length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Optimized: {(lastResult.optimized_tables ?? []).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}
    </CatalogPageShell>
  );
}
