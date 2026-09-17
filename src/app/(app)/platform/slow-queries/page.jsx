"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";

function AdviceModal({ open, onClose, selected, advising, advice, runningKey, onRunSql, onRunAction }) {
  if (!open || typeof document === "undefined") return null;

  const actions = advice?.platform_actions ?? [];
  const safeSql = advice?.safe_sql ?? [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="slow-query-advice-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="slow-query-advice-title" className="text-base font-semibold text-slate-900">
              Centrix AI advice
            </h2>
            {selected?.sql ? (
              <code className="mt-2 block max-h-16 overflow-y-auto whitespace-pre-wrap break-all text-xs text-slate-600">
                {selected.sql}
              </code>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          {advising ? (
            <p className="text-slate-500">Asking Centrix AI…</p>
          ) : advice ? (
            <div className="space-y-5">
              {advice.note ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{advice.note}</p>
              ) : null}

              <section>
                <h3 className="font-semibold text-emerald-800">Fast fix</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {(advice.fast_fix ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-indigo-800">Permanent fix</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {(advice.permanent_fix ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              {actions.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-amber-900">Clean up bloated data</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Deletes expired Hikvision / attendance rows via the same job as{" "}
                    <Link href="/platform/data-retention" className="text-[#185FA5] hover:underline">
                      Data retention
                    </Link>
                    .
                  </p>
                  <div className="mt-2 space-y-2">
                    {actions.map((action) => (
                      <div
                        key={action.id || action.label}
                        className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <p className="text-sm text-amber-950">{action.label}</p>
                        <PrimaryButton
                          type="button"
                          disabled={runningKey === `action:${action.id}`}
                          onClick={() => void onRunAction(action)}
                        >
                          {runningKey === `action:${action.id}` ? "Running…" : "Run"}
                        </PrimaryButton>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="font-semibold text-slate-900">Suggested SQL</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Allowed: ANALYZE TABLE, OPTIMIZE TABLE (retention tables), CREATE/ADD INDEX.
                </p>
                <div className="mt-2 space-y-2">
                  {safeSql.length === 0 ? (
                    <p className="text-slate-500">No runnable SQL suggested.</p>
                  ) : (
                    safeSql.map((sql) => (
                      <div
                        key={sql}
                        className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <code className="whitespace-pre-wrap break-all text-xs text-slate-800">{sql}</code>
                        <PrimaryButton
                          type="button"
                          disabled={runningKey === `sql:${sql}`}
                          onClick={() => void onRunSql(sql)}
                        >
                          {runningKey === `sql:${sql}` ? "Running…" : "Run"}
                        </PrimaryButton>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : (
            <p className="text-slate-500">No advice yet.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function PlatformSlowQueriesPage() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState("tables");
  const [digest, setDigest] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [advising, setAdvising] = useState(false);
  const [runningKey, setRunningKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/slow-queries?limit=25");
      setDigest(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load slow queries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resetDigests() {
    const ok = await confirm({
      title: "Reset query digests?",
      message:
        "Clears MySQL performance_schema statement digests so this list starts empty. New traffic refills it. Refresh alone only re-reads the same cumulative counters — that is why yesterday’s queries still appear.",
      confirmLabel: "Reset digests",
    });
    if (!ok) return;

    setResetting(true);
    try {
      const res = await apiRequest("/admin/slow-queries/reset", { method: "POST" });
      setDigest(res);
      setTab("digests");
      notifySuccess(res.message || "Digests reset.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to reset digests.");
    } finally {
      setResetting(false);
    }
  }

  async function askAi(row) {
    setSelected(row);
    setAdvice(null);
    setModalOpen(true);
    setAdvising(true);
    try {
      const res = await apiRequest("/admin/slow-queries/advise", {
        method: "POST",
        body: {
          sql: row.sql,
          digest: row.digest,
          avg_sec: row.avg_sec,
          exec_count: row.exec_count,
          rows_examined: row.rows_examined,
        },
      });
      setAdvice(res.advice ?? res.heuristic ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to get AI advice.");
      setModalOpen(false);
    } finally {
      setAdvising(false);
    }
  }

  async function runSql(sql) {
    const ok = await confirm({
      title: "Run suggested SQL?",
      message: sql,
      confirmLabel: "Run SQL",
    });
    if (!ok) return;

    setRunningKey(`sql:${sql}`);
    try {
      await apiRequest("/admin/slow-queries/run-fix", {
        method: "POST",
        body: { sql },
      });
      notifySuccess("SQL ran successfully.");
      void load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "SQL failed.");
    } finally {
      setRunningKey(null);
    }
  }

  async function runAction(action) {
    if (action.kind === "safe_sql" && action.sql) {
      await runSql(action.sql);
      return;
    }

    if (action.kind !== "operational_prune") {
      notifyError("Unknown action.");
      return;
    }

    const ok = await confirm({
      title: "Run data cleanup?",
      message:
        action.label ||
        "Deletes expired Hikvision commands/events, old attendance, and related noise. Optionally optimizes tables.",
      confirmLabel: "Run prune",
    });
    if (!ok) return;

    setRunningKey(`action:${action.id}`);
    try {
      const res = await apiRequest("/admin/operational-prune", {
        method: "POST",
        body: action.body ?? { dry_run: false, optimize_tables: true },
      });
      notifySuccess(`Pruned ${res.total ?? 0} rows.`);
      void load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Cleanup failed.");
    } finally {
      setRunningKey(null);
    }
  }

  async function quickCleanup(row) {
    setSelected(row);
    setModalOpen(true);
    setAdvising(true);
    setAdvice(null);
    try {
      const res = await apiRequest("/admin/slow-queries/advise", {
        method: "POST",
        body: {
          sql: row.sql,
          digest: row.digest,
          avg_sec: row.avg_sec,
          exec_count: row.exec_count,
          rows_examined: row.rows_examined,
        },
      });
      setAdvice(res.advice ?? res.heuristic ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to prepare cleanup advice.");
      setModalOpen(false);
    } finally {
      setAdvising(false);
    }
  }

  const queries = digest?.queries ?? [];
  const slowTables = digest?.slow_tables ?? [];
  const databaseName = digest?.database || "centrix";
  const busy = loading || resetting;

  return (
    <CatalogPageShell
      title="Slow queries"
      description={`Centrix database only (${databaseName}). Digests are cumulative until Reset — Refresh re-reads the same counters.`}
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Slow queries" },
          ]}
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/platform/data-retention" className={SECONDARY_BTN_CLASS}>
            Data retention
          </Link>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void resetDigests()}
            disabled={busy}
          >
            {resetting ? "Resetting…" : "Reset digests"}
          </button>
          <PrimaryButton type="button" onClick={() => void load()} disabled={busy}>
            {loading ? "Loading…" : "Refresh"}
          </PrimaryButton>
        </div>
      }
    >
      {digest && digest.available === false ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Performance schema digests unavailable</p>
          <p className="mt-1">{digest.reason}</p>
          {(digest.enable_hint ?? []).length > 0 && (
            <pre className="mt-3 overflow-x-auto rounded bg-white/80 p-3 text-xs text-slate-800">
              {(digest.enable_hint ?? []).join("\n")}
            </pre>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {[
          { id: "tables", label: "Slow table sizes" },
          { id: "digests", label: "Query digests" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === item.id
                ? "border-[#185FA5] text-[#185FA5]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {digest?.digest_note || digest?.refreshed_at ? (
        <p className="mt-3 text-xs text-slate-500">
          {digest?.digest_note ? <span>{digest.digest_note} </span> : null}
          {digest?.refreshed_at ? (
            <span>
              Last read: {new Date(digest.refreshed_at).toLocaleString()}
            </span>
          ) : null}
        </p>
      ) : null}

      {tab === "tables" ? (
        <section className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Table</th>
                  <th className="px-3 py-2">Size (MB)</th>
                  <th className="px-3 py-2">Approx. rows</th>
                  <th className="px-3 py-2">In slow queries</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-slate-500">
                      Loading table sizes…
                    </td>
                  </tr>
                ) : slowTables.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-slate-500">
                      No table size data for{" "}
                      <code className="rounded bg-slate-100 px-1">{databaseName}</code>.
                    </td>
                  </tr>
                ) : (
                  slowTables.map((table) => (
                    <tr
                      key={table.name}
                      className={`border-t border-slate-100 ${table.in_slow_queries ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">
                        <code className="text-xs">{table.name}</code>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{table.mb}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {Number(table.rows ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {table.in_slow_queries ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Yes
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="mt-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Avg s</th>
                  <th className="px-3 py-2">Total s</th>
                  <th className="px-3 py-2">Runs</th>
                  <th className="px-3 py-2">Rows examined</th>
                  <th className="px-3 py-2">SQL</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-slate-500">
                      Loading digests…
                    </td>
                  </tr>
                ) : queries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-slate-500">
                      No Centrix digests yet. Generate traffic after Reset, or enable
                      performance_schema / slow query logging.
                    </td>
                  </tr>
                ) : (
                  queries.map((row) => (
                    <tr key={row.digest || row.sql} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium">{row.avg_sec}</td>
                      <td className="px-3 py-2">{row.total_sec}</td>
                      <td className="px-3 py-2">{row.exec_count}</td>
                      <td className="px-3 py-2">{row.rows_examined}</td>
                      <td className="px-3 py-2">
                        <code className="block max-w-xl whitespace-pre-wrap break-all text-xs text-slate-700">
                          {row.sql}
                        </code>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            className={SECONDARY_BTN_CLASS}
                            onClick={() => void askAi(row)}
                            disabled={advising}
                          >
                            Ask Centrix AI
                          </button>
                          {row.cleanup_hint ? (
                            <button
                              type="button"
                              className={SECONDARY_BTN_CLASS}
                              onClick={() => void quickCleanup(row)}
                              disabled={advising}
                            >
                              Clean up table
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AdviceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selected={selected}
        advising={advising}
        advice={advice}
        runningKey={runningKey}
        onRunSql={runSql}
        onRunAction={runAction}
      />
    </CatalogPageShell>
  );
}
