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
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(null);
  const [status, setStatus] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [optimizeTables, setOptimizeTables] = useState(true);
  const [form, setForm] = useState(() => defaultForm());

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

  async function runPrune({ dryRun }) {
    const ok = await confirm({
      title: dryRun ? "Preview prune?" : "Run operational prune now?",
      message: dryRun
        ? "Counts rows that would be deleted. Nothing is removed."
        : `Deletes data older than the timers below.${
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
      if (res.status) {
        setStatus(res.status);
        setForm(defaultForm(res.status?.retention ?? {}));
      }
      notifySuccess(
        dryRun
          ? `Would delete ${res.total ?? 0} rows across retention tables.`
          : `Pruned ${res.total ?? 0} rows${
              (res.optimized_tables ?? []).length
                ? `; optimized ${(res.optimized_tables ?? []).length} tables`
                : ""
            }.`,
      );
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Prune failed.");
    } finally {
      setRunning(false);
    }
  }

  async function optimizeTable(tableName) {
    const ok = await confirm({
      title: `Optimize ${tableName}?`,
      message:
        "Runs OPTIMIZE TABLE to reclaim disk after deletes. May lock this table briefly — prefer off-peak hours for large tables.",
      confirmLabel: "Optimize",
    });
    if (!ok) return;

    setOptimizing(tableName);
    try {
      const res = await apiRequest("/admin/operational-prune/optimize", {
        method: "POST",
        body: { tables: [tableName] },
      });
      if (res.status) {
        setStatus(res.status);
        setForm(defaultForm(res.status?.retention ?? {}));
      }
      notifySuccess(`Optimized ${tableName}.`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Optimize failed.");
    } finally {
      setOptimizing(null);
    }
  }

  async function optimizeAllTables() {
    const ok = await confirm({
      title: "Optimize all retention tables?",
      message:
        "Runs OPTIMIZE TABLE on every listed table. Can take several minutes and briefly lock large tables (e.g. hikvision_agent_commands).",
      confirmLabel: "Optimize all",
    });
    if (!ok) return;

    setOptimizing("all");
    try {
      const res = await apiRequest("/admin/operational-prune/optimize", {
        method: "POST",
        body: {},
      });
      if (res.status) {
        setStatus(res.status);
        setForm(defaultForm(res.status?.retention ?? {}));
      }
      notifySuccess(`Optimized ${(res.optimized_tables ?? []).length} tables.`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Optimize failed.");
    } finally {
      setOptimizing(null);
    }
  }

  const tables = status?.tables ?? [];
  const deleted = lastResult?.deleted ?? null;
  const busy = loading || running || saving || Boolean(optimizing);

  return (
    <CatalogPageShell
      title="Data retention"
      description="Set prune timers, reclaim disk on large tables, and run the same cleanup as the nightly schedule."
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
            disabled={busy}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void runPrune({ dryRun: true })}
            disabled={busy}
          >
            Preview (dry run)
          </button>
          <PrimaryButton type="button" onClick={() => void runPrune({ dryRun: false })} disabled={busy}>
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
            Nightly schedule uses these timers (server timezone Africa/Nairobi).
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
              <h2 className="text-sm font-semibold text-slate-900">Table sizes (approx.)</h2>
              <p className="mt-1 text-xs text-slate-500">
                From information_schema — row counts are estimates. Optimize reclaim disk after deletes.
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
                    <th className="py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((row) => (
                    <tr key={row.name} className="border-b border-slate-50">
                      <td className="py-2 pr-3 font-mono text-xs text-slate-800">{row.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.mb}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                        {Number(row.rows || 0).toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className={SECONDARY_BTN_CLASS}
                          onClick={() => void optimizeTable(row.name)}
                          disabled={busy}
                        >
                          {optimizing === row.name ? "…" : "Optimize"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            Tip: run <span className="font-medium">Run prune now</span> first to delete old rows, then
            Optimize on the largest tables (e.g. hikvision_agent_commands) to shrink disk use.
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
