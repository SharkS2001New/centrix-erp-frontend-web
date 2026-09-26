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

function AdviceModal({ open, onClose, selected, advising, advice, analysis, runningKey, onRunSql, onRunAction }) {
  if (!open || typeof document === "undefined") return null;

  const actions = advice?.platform_actions ?? [];
  const safeSql = advice?.safe_sql ?? [];
  const hypotheses = advice?.hypotheses ?? analysis?.hypotheses ?? [];
  const route = analysis?.route ?? null;
  const relatedDigests = analysis?.related_digests ?? [];
  const relatedIssues = analysis?.related_issues ?? [];

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
            {analysis?.path ? (
              <p className="mt-2 text-xs text-slate-600">
                <span className="font-medium">{analysis.method || "GET"}</span>{" "}
                <code className="break-all">{analysis.path}</code>
                {route?.action ? (
                  <span className="mt-1 block text-slate-500">→ {route.action}</span>
                ) : (
                  <span className="mt-1 block text-amber-700">No Laravel route matched — check method/path.</span>
                )}
              </p>
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
          ) : advice || analysis ? (
            <div className="space-y-5">
              {advice?.note ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600">{advice.note}</p>
              ) : null}

              {hypotheses.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-slate-900">Why it may be slow</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                    {hypotheses.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {relatedIssues.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-rose-800">Matching slow reports</h3>
                  <ul className="mt-1 space-y-1 text-xs text-slate-700">
                    {relatedIssues.slice(0, 5).map((issue) => (
                      <li key={issue.id} className="rounded border border-rose-100 bg-rose-50/50 px-2 py-1.5">
                        {(issue.http_method || "").toUpperCase()} {issue.api_path}
                        {issue.duration_ms != null ? ` · ${issue.duration_ms} ms` : ""}
                        {issue.message ? ` — ${issue.message}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {relatedDigests.length > 0 ? (
                <section>
                  <h3 className="font-semibold text-amber-900">Related MySQL digests</h3>
                  <ul className="mt-1 space-y-2">
                    {relatedDigests.slice(0, 4).map((row) => (
                      <li
                        key={row.digest || row.sql}
                        className="rounded border border-amber-100 bg-amber-50/40 p-2"
                      >
                        <p className="text-xs text-amber-950">
                          avg {row.avg_sec}s · total {row.total_sec}s · {row.exec_count} runs
                        </p>
                        <code className="mt-1 block max-h-14 overflow-y-auto whitespace-pre-wrap break-all text-[11px] text-slate-700">
                          {row.sql}
                        </code>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="font-semibold text-emerald-800">Fast fix</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {(advice?.fast_fix ?? []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-indigo-800">Permanent fix</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                  {(advice?.permanent_fix ?? []).map((item) => (
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
  const [capturing, setCapturing] = useState(false);
  const [tab, setTab] = useState("digests");
  const [digest, setDigest] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [advising, setAdvising] = useState(false);
  const [runningKey, setRunningKey] = useState(null);
  const [pasteSql, setPasteSql] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [urlMethod, setUrlMethod] = useState("GET");
  const [urlAnalysis, setUrlAnalysis] = useState(null);
  const [captureNote, setCaptureNote] = useState("");

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

  async function captureDigests() {
    const ok = await confirm({
      title: "Capture a fresh digest window?",
      message:
        "Resets MySQL statement digests, then waits ~45 seconds while you (or the system) generate Centrix traffic. After that we Refresh automatically so you can see what was slow and Ask Centrix AI.",
      confirmLabel: "Start capture",
    });
    if (!ok) return;

    setCapturing(true);
    setTab("digests");
    setCaptureNote("Resetting digests…");
    try {
      const res = await apiRequest("/admin/slow-queries/reset", { method: "POST" });
      setDigest(res);
      setCaptureNote(
        "Capture window open — use Centrix (POS, reports, login) for about 45 seconds. Refreshing automatically…",
      );
      notifySuccess("Capture started. Generate traffic now.");

      await new Promise((resolve) => setTimeout(resolve, 45000));
      setCaptureNote("Reading digests…");
      const fresh = await apiRequest("/admin/slow-queries?limit=25");
      setDigest(fresh);
      const count = fresh?.queries?.length ?? 0;
      setCaptureNote(
        count > 0
          ? `Captured ${count} Centrix digest(s). Review the list and Ask Centrix AI on any row.`
          : fresh?.empty_hint ||
              "Still empty after the capture window. Generate more Centrix traffic and Refresh, or paste SQL below.",
      );
      notifySuccess(count > 0 ? `Captured ${count} digest(s).` : "Capture finished — list still empty.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Capture failed.");
      setCaptureNote("");
    } finally {
      setCapturing(false);
    }
  }

  async function askAi(row) {
    setSelected(row);
    setAdvice(null);
    setUrlAnalysis(null);
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

  async function askAiFromPaste() {
    const sql = pasteSql.trim();
    if (!sql) {
      notifyError("Paste a SQL statement first.");
      return;
    }
    setUrlAnalysis(null);
    await askAi({ sql, digest: null, avg_sec: null, exec_count: null, rows_examined: null });
  }

  async function analyzeApiUrl() {
    const url = pasteUrl.trim();
    if (!url) {
      notifyError("Paste a slow API URL or path first.");
      return;
    }

    setSelected({ sql: null });
    setAdvice(null);
    setUrlAnalysis(null);
    setModalOpen(true);
    setAdvising(true);
    try {
      const res = await apiRequest("/admin/slow-queries/advise-url", {
        method: "POST",
        body: { url, method: urlMethod },
      });
      setUrlAnalysis(res.analysis ?? null);
      setAdvice(res.advice ?? null);
      notifySuccess("API analysis ready — review causes and fixes.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to analyze API URL.");
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
    setUrlAnalysis(null);
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
  const stats = digest?.stats ?? null;
  const busy = loading || resetting || capturing;

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
            onClick={() => void captureDigests()}
            disabled={busy}
          >
            {capturing ? "Capturing…" : "Capture digests"}
          </button>
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

      {captureNote ? (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          {captureNote}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Ask Centrix AI about a query</p>
          <p className="mt-1 text-xs text-slate-500">
            Paste any slow SQL for fast/permanent fixes and safe ANALYZE/OPTIMIZE suggestions.
          </p>
          <textarea
            className="mt-3 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
            rows={4}
            value={pasteSql}
            onChange={(e) => setPasteSql(e.target.value)}
            placeholder="SELECT … FROM sales WHERE …"
            disabled={advising}
          />
          <div className="mt-2">
            <PrimaryButton
              type="button"
              disabled={advising || !pasteSql.trim()}
              onClick={() => void askAiFromPaste()}
            >
              {advising ? "Asking…" : "Ask Centrix AI"}
            </PrimaryButton>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Analyze a slow API URL</p>
          <p className="mt-1 text-xs text-slate-500">
            Paste a Network tab URL or path (e.g.{" "}
            <code className="rounded bg-slate-100 px-1">/api/v1/reports/daily-sales?from=…</code>
            ). We match the Laravel route, related digests, and slow reports, then Ask Centrix AI why it’s slow.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800"
              value={urlMethod}
              onChange={(e) => setUrlMethod(e.target.value)}
              disabled={advising}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://…/api/v1/… or GET /api/v1/sales/orders"
              disabled={advising}
            />
          </div>
          <div className="mt-2">
            <PrimaryButton
              type="button"
              disabled={advising || !pasteUrl.trim()}
              onClick={() => void analyzeApiUrl()}
            >
              {advising ? "Analyzing…" : "Analyze API URL"}
            </PrimaryButton>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {[
          { id: "digests", label: "Query digests" },
          { id: "tables", label: "Slow table sizes" },
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

      {digest?.digest_note || digest?.refreshed_at || stats ? (
        <p className="mt-3 text-xs text-slate-500">
          {digest?.list_mode === "notable" ? (
            <span className="mr-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
              Showing notable Centrix traffic (none crossed slow thresholds)
            </span>
          ) : null}
          {stats ? (
            <span className="mr-1">
              Fetched {stats.raw_fetched ?? 0} · Centrix {stats.centrix_candidates ?? 0} · Slow{" "}
              {stats.slow_count ?? 0} · Notable {stats.notable_count ?? 0}.{" "}
            </span>
          ) : null}
          {digest?.digest_note ? <span>{digest.digest_note} </span> : null}
          {digest?.refreshed_at ? (
            <span>Last read: {new Date(digest.refreshed_at).toLocaleString()}</span>
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
                  <th className="px-3 py-2">Allocated MB</th>
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
                      <td className="px-3 py-2 tabular-nums">
                        {Number(table.mb ?? 0).toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </td>
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
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Avg s</th>
                  <th className="px-3 py-2">Total s</th>
                  <th className="px-3 py-2">Runs</th>
                  <th className="px-3 py-2">Rows examined</th>
                  <th className="px-3 py-2">SQL</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading || capturing ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-slate-500">
                      {capturing ? "Capturing digests…" : "Loading digests…"}
                    </td>
                  </tr>
                ) : queries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6">
                      <div className="space-y-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">No Centrix digests to show yet</p>
                        <p className="text-slate-600">
                          {digest?.empty_hint ||
                            "Generate Centrix traffic after Reset, enable performance_schema, or paste SQL above and Ask Centrix AI."}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <PrimaryButton type="button" disabled={busy} onClick={() => void captureDigests()}>
                            Capture digests
                          </PrimaryButton>
                          <button
                            type="button"
                            className={SECONDARY_BTN_CLASS}
                            disabled={busy}
                            onClick={() => void load()}
                          >
                            Refresh now
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  queries.map((row) => (
                    <tr key={row.digest || row.sql} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        {row.severity === "notable" ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Notable
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            Slow
                          </span>
                        )}
                      </td>
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
        analysis={urlAnalysis}
        runningKey={runningKey}
        onRunSql={runSql}
        onRunAction={runAction}
      />
    </CatalogPageShell>
  );
}
