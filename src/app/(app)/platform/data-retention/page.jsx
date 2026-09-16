"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
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

export default function PlatformDataRetentionPage() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [optimizeTables, setOptimizeTables] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/operational-prune");
      setStatus(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load retention status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runPrune({ dryRun }) {
    const ok = await confirm({
      title: dryRun ? "Preview prune?" : "Run operational prune now?",
      message: dryRun
        ? "Counts rows that would be deleted. Nothing is removed."
        : `Deletes expired Hikvision commands/events, attendance older than retention, stock holds, and audit noise.${
            optimizeTables
              ? "\n\nOPTIMIZE TABLE will run afterward to reclaim disk (may lock tables briefly)."
              : ""
          }`,
      confirmLabel: dryRun ? "Preview" : "Run prune",
    });
    if (!ok) return;

    setRunning(true);
    try {
      const res = await apiRequest("/admin/operational-prune", {
        method: "POST",
        body: {
          dry_run: dryRun,
          optimize_tables: !dryRun && optimizeTables,
        },
      });
      setLastResult(res);
      if (res.status) setStatus(res.status);
      notifySuccess(
        dryRun
          ? `Would delete ${res.total ?? 0} rows across retention tables.`
          : `Pruned ${res.total ?? 0} rows${
              (res.optimized_tables ?? []).length
                ? `; optimized ${(res.optimized_tables ?? []).length} tables`
                : ""
            }.`,
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Prune failed.");
    } finally {
      setRunning(false);
    }
  }

  const retention = status?.retention ?? {};
  const tables = status?.tables ?? [];
  const deleted = lastResult?.deleted ?? null;

  return (
    <CatalogPageShell
      title="Data retention"
      description="Run the same operational prune as the nightly schedule — Hikvision agent data, missed punches, attendance older than 2 months, and related cleanup."
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Data retention" },
          ]}
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void load()}
            disabled={loading || running}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void runPrune({ dryRun: true })}
            disabled={loading || running}
          >
            Preview (dry run)
          </button>
          <PrimaryButton
            type="button"
            onClick={() => void runPrune({ dryRun: false })}
            disabled={loading || running}
          >
            {running ? "Running…" : "Run prune now"}
          </PrimaryButton>
        </div>
      }
    >
      <label className="mb-4 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={optimizeTables}
          onChange={(e) => setOptimizeTables(e.target.checked)}
          disabled={running}
        />
        <span>
          After prune, run <span className="font-medium">OPTIMIZE TABLE</span> on retention tables
          to reclaim disk space (recommended after a large cleanup).
        </span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Retention windows</h2>
          <p className="mt-1 text-xs text-slate-500">
            Nightly schedule: {status?.schedule_time ?? "03:40"} (Africa/Nairobi server time).
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Hikvision events / missed punches</dt>
              <dd className="font-medium">{retention.hikvision_access_events_days ?? 7} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Attendance + clock sessions</dt>
              <dd className="font-medium">{retention.attendance_days ?? 60} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Hikvision agent commands (leftovers)</dt>
              <dd className="font-medium">
                {retention.hikvision_agent_commands_completed_days ?? 1} /{" "}
                {retention.hikvision_agent_commands_failed_days ?? 2} days
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">KRA agent commands (completed)</dt>
              <dd className="font-medium">{retention.kra_agent_commands_completed_days ?? 30} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Released stock reservations</dt>
              <dd className="font-medium">{retention.released_stock_reservations_days ?? 14} days</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Audit logs</dt>
              <dd className="font-medium">{retention.audit_logs_days ?? 10} days</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Table sizes (approx.)</h2>
          <p className="mt-1 text-xs text-slate-500">From information_schema — row counts are estimates.</p>
          {loading && !tables.length ? (
            <p className="mt-3 text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Table</th>
                    <th className="py-2 pr-3 font-medium text-right">MB</th>
                    <th className="py-2 font-medium text-right">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((row) => (
                    <tr key={row.name} className="border-b border-slate-50">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-800">{row.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.mb}</td>
                      <td className="py-2 text-right tabular-nums text-slate-600">
                        {Number(row.rows || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
          {(lastResult?.optimized_tables ?? []).length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Optimized: {(lastResult.optimized_tables ?? []).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}
    </CatalogPageShell>
  );
}
