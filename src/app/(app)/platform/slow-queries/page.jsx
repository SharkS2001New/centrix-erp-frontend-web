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

export default function PlatformSlowQueriesPage() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [digest, setDigest] = useState(null);
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [advising, setAdvising] = useState(false);
  const [runningSql, setRunningSql] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/slow-queries?limit=25");
      setDigest(res);
      setSelected(null);
      setAdvice(null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load slow queries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function askAi(row) {
    setSelected(row);
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
      notifyError(e instanceof ApiError ? e.message : "Failed to get AI advice.");
    } finally {
      setAdvising(false);
    }
  }

  async function runSql(sql) {
    const ok = await confirm({
      title: "Run fast-fix SQL?",
      message: `Only ANALYZE TABLE / CREATE INDEX are allowed.\n\n${sql}`,
      confirmLabel: "Run SQL",
    });
    if (!ok) return;

    setRunningSql(sql);
    try {
      await apiRequest("/admin/slow-queries/run-fix", {
        method: "POST",
        body: { sql },
      });
      notifySuccess("SQL ran successfully.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "SQL failed.");
    } finally {
      setRunningSql(null);
    }
  }

  const queries = digest?.queries ?? [];
  const adviceBlock = advice ?? null;

  return (
    <CatalogPageShell
      title="Slow queries"
      description="Top MySQL digests from performance_schema, with Centrix AI fast and permanent fixes."
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Slow queries" },
          ]}
        />
      }
      actions={
        <PrimaryButton type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </PrimaryButton>
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

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
                  No digests yet. Enable performance_schema / slow query logging and generate traffic.
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
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      onClick={() => void askAi(row)}
                      disabled={advising && selected?.digest === row.digest}
                    >
                      Ask Centrix AI
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Advice</h2>
          {advising ? (
            <p className="mt-2 text-sm text-slate-500">Asking Centrix AI…</p>
          ) : adviceBlock ? (
            <div className="mt-3 space-y-4 text-sm">
              {adviceBlock.note ? (
                <p className="rounded bg-slate-50 px-3 py-2 text-slate-600">{adviceBlock.note}</p>
              ) : null}
              <section>
                <h3 className="font-semibold text-emerald-800">Fast fix</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {(adviceBlock.fast_fix ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-indigo-800">Permanent fix</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {(adviceBlock.permanent_fix ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="font-semibold text-slate-900">Safe SQL (run from here)</h3>
                <div className="mt-2 space-y-2">
                  {(adviceBlock.safe_sql ?? []).length === 0 ? (
                    <p className="text-slate-500">No index/analyze SQL suggested.</p>
                  ) : (
                    (adviceBlock.safe_sql ?? []).map((sql) => (
                      <div
                        key={sql}
                        className="flex flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <code className="text-xs text-slate-800 whitespace-pre-wrap break-all">{sql}</code>
                        <PrimaryButton
                          type="button"
                          disabled={runningSql === sql}
                          onClick={() => void runSql(sql)}
                        >
                          {runningSql === sql ? "Running…" : "Run"}
                        </PrimaryButton>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Select Ask Centrix AI on a query.</p>
          )}
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
