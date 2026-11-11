"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { apiRequest, platformSpeedProbeStream, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { notifyError, notifySuccess } from "@/lib/notify";
import { classifyLatency } from "@/lib/latency-split";

function stamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LiveSpeedProbeModal({
  open,
  busy,
  advising,
  logs,
  logEndRef,
  advice,
  onClose,
  onAskAi,
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-speed-probe-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 id="live-speed-probe-title" className="text-base font-semibold text-white">
              Live ERP Speed probe
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {busy
                ? "Streaming each probe step…"
                : logs.length
                  ? `${logs.length} line(s) · probe finished`
                  : "Waiting for output…"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-violet-500/60 bg-violet-600/20 px-3 py-1.5 text-sm text-violet-100 hover:bg-violet-600/30 disabled:opacity-40"
              onClick={onAskAi}
              disabled={busy || advising || logs.length === 0}
            >
              {advising ? "Asking AI…" : "Ask Centrix AI"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-40"
              onClick={onClose}
              disabled={busy}
            >
              {busy ? "Running…" : "Close"}
            </button>
          </div>
        </div>
        <div className="min-h-[220px] flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <p className="text-slate-500">Waiting for probe…</p>
          ) : (
            logs.map((line) => (
              <div
                key={line.id}
                className={
                  line.tone === "error"
                    ? "text-rose-300"
                    : line.tone === "ok"
                      ? "text-emerald-300"
                      : line.tone === "warn"
                        ? "text-amber-200"
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
        {advice ? (
          <div className="border-t border-slate-800 bg-slate-900/80 px-5 py-4 text-sm text-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
              Centrix AI · {advice.source === "ai" ? "AI" : "Rules"}
              {advice.urgency ? ` · ${advice.urgency}` : ""}
            </p>
            <p className="mt-1 font-medium text-white">{advice.headline}</p>
            {advice.note ? <p className="mt-1 text-xs text-amber-200/90">{advice.note}</p> : null}
            {(advice.findings ?? []).length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300">
                {advice.findings.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
            {(advice.actions ?? []).length > 0 ? (
              <>
                <p className="mt-3 text-xs font-semibold text-slate-400">Suggested actions</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-300">
                  {advice.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "api", label: "Slow API Endpoints" },
  { id: "queues", label: "Queues & Jobs" },
  { id: "health", label: "Infrastructure Health" },
];

const RANGES = [
  { id: "1h", label: "Last 1 hour" },
  { id: "6h", label: "Last 6 hours" },
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
];

function formatMs(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value))} ms`;
}

function StatusBadge({ status }) {
  const label =
    status === "ok" ? "OK" : status === "degraded" ? "Degraded" : status === "critical" ? "Critical" : "—";
  const className =
    status === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : status === "degraded"
        ? "bg-amber-100 text-amber-900"
        : status === "critical"
          ? "bg-red-100 text-red-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function KpiCard({ label, value, hint, unavailable }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${unavailable ? "text-slate-400" : "text-slate-900"}`}>
        {unavailable ? "Unavailable" : value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function LatencyTrend({ points }) {
  const rows = Array.isArray(points) ? points : [];
  if (rows.length < 2) {
    return <p className="text-sm text-slate-500">No traffic trend yet — wait for flush after API traffic.</p>;
  }
  const values = rows.flatMap((r) => [r.p50, r.p95, r.p99].filter((v) => v != null).map(Number));
  const max = Math.max(1, ...values);
  const w = 560;
  const h = 160;
  const step = w / Math.max(1, rows.length - 1);
  const line = (key, color) => {
    const d = rows
      .map((r, i) => {
        const v = r[key];
        if (v == null) return null;
        const x = i * step;
        const y = h - (Number(v) / max) * (h - 12) - 6;
        return `${x},${y}`;
      })
      .filter(Boolean)
      .join(" ");
    return d ? <polyline fill="none" stroke={color} strokeWidth="2" points={d} /> : null;
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" role="img" aria-label="Latency trend">
      {line("p50", "#185FA5")}
      {line("p95", "#7c3aed")}
      {line("p99", "#0d9488")}
    </svg>
  );
}

function Panel({ title, children, action }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function PlatformSpeedPage() {
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState("1h");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [tabData, setTabData] = useState(null);
  const [clientProbe, setClientProbe] = useState(null);
  const [probeOpen, setProbeOpen] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeAdvising, setProbeAdvising] = useState(false);
  const [probeLogs, setProbeLogs] = useState([]);
  const [probeAdvice, setProbeAdvice] = useState(null);
  const [probeSummary, setProbeSummary] = useState(null);
  const [selectedFailedJobId, setSelectedFailedJobId] = useState(null);
  const [failedJobsPage, setFailedJobsPage] = useState(1);
  const [clearFailedBusy, setClearFailedBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [reverbBusy, setReverbBusy] = useState(false);
  const [reverbTest, setReverbTest] = useState(null);
  const probeLogEndRef = useRef(null);

  const appendProbeLog = useCallback((message, tone = "info") => {
    if (!message) return;
    setProbeLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, at: stamp(), message, tone },
    ]);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const res = await apiRequest(`/admin/platform-speed?range=${range}`, { loading: false });
      const clientRttMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      setResult(res);
      setClientProbe(classifyLatency({ clientRttMs, serverMs: res?.server_ms != null ? Number(res.server_ms) : null }));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Speed check failed");
    } finally {
      setLoading(false);
    }
  }, [range]);

  const sendReverbNotification = useCallback(async () => {
    setReverbBusy(true);
    setReverbTest(null);
    try {
      const res = await apiRequest("/admin/platform-health/reverb-test", {
        method: "POST",
        loading: false,
      });
      setReverbTest(res);
      if (res?.ok) {
        notifySuccess("Test notification sent over Reverb — watch the bell badge update without refreshing.");
      } else {
        notifyError(res?.message || "Reverb test failed");
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Reverb test failed";
      setReverbTest({ ok: false, message });
      notifyError(message);
    } finally {
      setReverbBusy(false);
    }
  }, []);

  const loadTab = useCallback(async (id, page = 1) => {
    if (id === "overview") {
      setTabData(null);
      return;
    }
    if (id === "health") {
      setHealthBusy(true);
      try {
        const res = await apiRequest("/admin/platform-health", { loading: false });
        setTabData(res);
      } catch (e) {
        notifyError(e instanceof ApiError ? e.message : "Infrastructure health check failed");
        setTabData(null);
      } finally {
        setHealthBusy(false);
      }
      return;
    }
    if (id === "queues") {
      try {
        const [queue, failedJobs] = await Promise.all([
          apiRequest("/admin/platform-speed/queues", { loading: false }),
          apiRequest(`/admin/platform-speed/failed-jobs?page=${page}`, { loading: false }),
        ]);
        setTabData({ ...queue, failed_jobs: failedJobs });
        setFailedJobsPage(page);
      } catch (e) {
        notifyError(e instanceof ApiError ? e.message : "Failed to load queue details");
        setTabData(null);
      }
      return;
    }
    const path = `/admin/platform-speed/api?range=${range}`;
    try {
      const res = await apiRequest(path, { loading: false });
      setTabData(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load tab");
      setTabData(null);
    }
  }, [range]);

  const clearFailedJobs = useCallback(async () => {
    const total = Number(tabData?.failed_jobs?.total ?? 0);
    if (total <= 0 || clearFailedBusy) return;
    const ok = window.confirm(
      `Clear all ${total} failed job(s)?\n\nThis only removes the failed list — it does not retry them. Use this after a fix to see if failures reappear.`,
    );
    if (!ok) return;

    setClearFailedBusy(true);
    try {
      const res = await apiRequest("/admin/platform-speed/failed-jobs", {
        method: "DELETE",
        body: { confirm: true, all: true },
        loading: false,
      });
      notifySuccess(res?.message || `Cleared ${res?.deleted ?? 0} failed job(s).`);
      setSelectedFailedJobId(null);
      await loadTab("queues", 1);
      void loadOverview();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to clear failed jobs");
    } finally {
      setClearFailedBusy(false);
    }
  }, [clearFailedBusy, loadOverview, loadTab, tabData?.failed_jobs?.total]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab !== "overview") void loadTab(tab);
  }, [tab, loadTab]);

  const api = result?.api ?? {};
  const infra = result?.infrastructure ?? {};
  const monitoringOn = result?.monitoring?.enabled !== false;

  const healthChecks = useMemo(
    () => (Array.isArray(result?.health?.checks) ? result.health.checks : []),
    [result],
  );

  useEffect(() => {
    if (probeOpen && probeLogEndRef.current) {
      probeLogEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [probeLogs, probeOpen]);

  async function runLiveProbe() {
    setProbeOpen(true);
    setProbeBusy(true);
    setProbeAdvice(null);
    setProbeSummary(null);
    setProbeLogs([]);
    appendProbeLog("Opening live probe stream…", "info");
    try {
      const done = await platformSpeedProbeStream({
        range,
        onEvent: (event) => {
          if (!event?.message) return;
          const tone =
            event.event === "error"
              ? "error"
              : event.ok === false
                ? "error"
                : event.ok === true || event.phase === "done"
                  ? "ok"
                  : "info";
          appendProbeLog(event.message, tone);
        },
      });
      if (done?.summary) {
        setProbeSummary(done.summary);
        if (done.summary.status) {
          setResult((prev) =>
            prev
              ? {
                  ...prev,
                  status: done.summary.status,
                  latency_probe: done.summary.latency_probe ?? prev.latency_probe,
                  health: done.summary.health ?? prev.health,
                  slow_queries: done.summary.slow_queries ?? prev.slow_queries,
                }
              : prev,
          );
        }
      }
      notifySuccess("Live probe finished.");
    } catch (e) {
      appendProbeLog(e instanceof ApiError ? e.message : "Live probe failed.", "error");
      notifyError(e instanceof ApiError ? e.message : "Live probe failed.");
    } finally {
      setProbeBusy(false);
    }
  }

  async function askProbeAi() {
    if (!probeSummary && probeLogs.length === 0) return;
    setProbeAdvising(true);
    try {
      const res = await apiRequest("/admin/platform-speed/advise", {
        method: "POST",
        body: {
          summary: probeSummary ?? {
            status: result?.status,
            latency_probe: result?.latency_probe,
            api: result?.api,
            slow_issues: result?.slow_issues,
          },
          log_excerpt: probeLogs.map((l) => `[${l.at}] ${l.message}`).join("\n").slice(0, 11000),
        },
      });
      setProbeAdvice(res.advice ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "AI advice failed.");
    } finally {
      setProbeAdvising(false);
    }
  }

  return (
    <CatalogPageShell
      title="ERP Speed"
      subtitle="Track API latency and reported slow endpoints, review failed jobs, and run live checks."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={inputClassName()}
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              monitoringOn ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${monitoringOn ? "bg-emerald-500" : "bg-slate-400"}`} />
            {monitoringOn ? "Monitoring Active" : "Monitoring Off"}
          </span>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={probeBusy || loading}
            onClick={() => void runLiveProbe()}
          >
            {probeBusy ? "Probing…" : "Live probe"}
          </button>
          <PrimaryButton type="button" showIcon={false} onClick={() => void loadOverview()} disabled={loading || probeBusy}>
            {loading ? "Measuring…" : "Measure"}
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "ERP Speed" }]} />

      <LiveSpeedProbeModal
        open={probeOpen}
        busy={probeBusy}
        advising={probeAdvising}
        logs={probeLogs}
        logEndRef={probeLogEndRef}
        advice={probeAdvice}
        onClose={() => {
          if (!probeBusy) setProbeOpen(false);
        }}
        onAskAi={() => void askProbeAi()}
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id
                ? "bg-[#185FA5] text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          <button
            type="button"
            className="flex flex-wrap items-center gap-2 text-left text-sm text-slate-600 hover:text-slate-900"
            onClick={() => void runLiveProbe()}
            title="Open live probe log"
          >
            <StatusBadge status={result?.status} />
            <span className="underline decoration-slate-300 underline-offset-2">
              Probe {formatMs(result?.server_ms)}
            </span>
            {clientProbe ? <span>· Client RTT {formatMs(clientProbe.clientRttMs)}</span> : null}
            <span className="text-xs font-medium text-[#185FA5]">· Live log</span>
          </button>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="API p50" value={formatMs(api.p50)} hint={api.request_count ? `${api.request_count} req` : "No aggregates yet"} />
            <KpiCard label="API p95" value={formatMs(api.p95)} />
            <KpiCard label="API p99" value={formatMs(api.p99)} />
            <KpiCard
              label="Throughput"
              value={api.throughput_per_min != null ? `${api.throughput_per_min}/min` : "—"}
            />
            <KpiCard
              label="Error rate"
              value={api.error_rate_percent != null ? `${api.error_rate_percent}%` : "—"}
            />
            <KpiCard
              label="DB query latency"
              value={formatMs(
                result?.database?.app_fingerprints?.query_latency_ms ??
                  result?.latency_probe?.db_ms,
              )}
              hint={
                result?.database?.app_fingerprints?.query_latency_ms != null
                  ? "Average observed query"
                  : "Live database ping (SELECT 1)"
              }
            />
            <KpiCard
              label="Memory (PHP)"
              value={infra?.memory?.php_memory_mb != null ? `${infra.memory.php_memory_mb} MB` : "—"}
              hint={infra?.memory?.note}
            />
            <KpiCard
              label="CPU %"
              unavailable={!infra?.cpu?.available}
              value="—"
              hint={infra?.cpu?.note || "Needs node exporter"}
            />
            <KpiCard
              label="Load avg"
              unavailable={!infra?.load?.available}
              value={infra?.load?.available ? String(infra.load.load_1) : "—"}
              hint={infra?.load?.note}
            />
            <KpiCard
              label="Disk used"
              unavailable={!infra?.disk?.available}
              value={infra?.disk?.available ? `${infra.disk.used_percent}%` : "—"}
            />
            <KpiCard
              label="Queue backlog"
              value={infra?.queue?.pending != null ? String(infra.queue.pending) : "—"}
              hint={infra?.queue?.note}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Response time trend (p50 / p95 / p99)">
              <LatencyTrend points={api.trend} />
              <p className="mt-2 text-xs text-slate-500">Blue p50 · Purple p95 · Teal p99</p>
            </Panel>
            <Panel
              title="Slowest endpoints"
              action={
                <Link href="/platform/speed" className="text-xs font-medium text-[#185FA5]" onClick={() => setTab("api")}>
                  View all
                </Link>
              }
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1 pr-2">Route</th>
                      <th className="py-1 pr-2">Max latency</th>
                      <th className="py-1 pr-2">Reports</th>
                      <th className="py-1">Tenants</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(api.slow_endpoints || []).slice(0, 5).map((row) => (
                      <tr key={`${row.method}-${row.route_key}`} className="border-t border-slate-100">
                        <td className="max-w-[12rem] truncate py-1.5 pr-2 font-mono text-[11px]">
                          {row.method} {row.route_key}
                        </td>
                        <td className="py-1.5 pr-2">{formatMs(row.reported_max_ms ?? row.max_ms)}</td>
                        <td className="py-1.5 pr-2">{row.report_count || 0}</td>
                        <td className="py-1.5">{row.reported_organizations?.length || 0}</td>
                      </tr>
                    ))}
                    {(api.slow_endpoints || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-3 text-slate-500">
                          No active slow reports or endpoints above the latency threshold.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="System health">
              <ul className="space-y-2 text-sm">
                {healthChecks.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="text-slate-700">{c.label || c.id}</span>
                    <span
                      className={`text-xs font-semibold ${
                        c.ok === true ? "text-emerald-700" : c.ok === false ? "text-red-700" : "text-slate-500"
                      }`}
                    >
                      {c.ok === true ? "Good" : c.ok === false ? "Fail" : "N/A"}
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" className="mt-3 inline-block text-xs font-medium text-[#185FA5] hover:underline" onClick={() => setTab("health")}>
                Open Infrastructure Health →
              </button>
            </Panel>
          </div>

          <div>
            <Panel title="Recent alerts">
              <ul className="space-y-2 text-sm">
                {(result?.diagnostics || []).slice(0, 6).map((d, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.severity}</p>
                    <p className="font-medium text-slate-900">{d.title}</p>
                    <p className="text-xs text-slate-600">{d.detail}</p>
                  </li>
                ))}
                {(result?.slow_issues?.recent || []).slice(0, 3).map((issue) => (
                  <li key={issue.id} className="rounded-lg border border-slate-100 px-3 py-2 text-xs">
                    <span className="font-semibold text-amber-800">Slow report</span>{" "}
                    {issue.http_method} {issue.api_path} · {formatMs(issue.duration_ms)}
                  </li>
                ))}
                {(result?.diagnostics || []).length === 0 && (result?.slow_issues?.recent || []).length === 0 ? (
                  <li className="text-slate-500">No alerts right now.</li>
                ) : null}
              </ul>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "api" ? (
        <Panel
          title="Slow API endpoints"
          action={
            <Link href="/platform/system-issues?kind=slow" className="text-xs font-medium text-[#185FA5] hover:underline">
              Open System Errors & Reports
            </Link>
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            Routes are included when they have an active slow report or measured p95 latency above the configured threshold.
            Reports are grouped by method and endpoint.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Route</th>
                  <th className="py-2 pr-3">Slow reports</th>
                  <th className="py-2 pr-3">Reported max</th>
                  <th className="py-2 pr-3">Measured p95</th>
                  <th className="py-2">Tenant(s)</th>
                </tr>
              </thead>
              <tbody>
                {(tabData?.slow_endpoints || api.slow_endpoints || []).map((row) => (
                  <tr key={`${row.method}-${row.route_key}`} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {row.method} {row.route_key}
                    </td>
                    <td className="py-2 pr-3">
                      {row.report_count ? (
                        <span className="font-medium text-amber-800">{row.report_count}</span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-3">{formatMs(row.reported_max_ms)}</td>
                    <td className="py-2 pr-3">{formatMs(row.p95_ms)}</td>
                    <td className="py-2">
                      {row.reported_organizations?.length
                        ? row.reported_organizations.map((org) => org.company_code || org.name).join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(tabData?.slow_endpoints || api.slow_endpoints || []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No active slow reports or measured endpoints above the configured threshold.
              </p>
            ) : null}
          </div>
          {(tabData?.slow_endpoints || api.slow_endpoints || []).some((endpoint) => endpoint.reports?.length) ? (
            <div className="mt-4 space-y-3">
              {(tabData?.slow_endpoints || api.slow_endpoints || [])
                .filter((endpoint) => endpoint.reports?.length)
                .map((endpoint) => (
                  <div key={`${endpoint.method}-${endpoint.route_key}-reports`} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-mono text-xs font-semibold">{endpoint.method} {endpoint.route_key}</p>
                    <ul className="mt-2 space-y-2">
                      {endpoint.reports.map((report) => (
                        <li key={report.id} className="text-xs text-slate-600">
                          <span className="font-medium text-slate-800">
                            {report.organization?.company_code || report.organization?.name || "Tenant"}
                          </span>
                          {" · "}{formatMs(report.duration_ms)}{" · "}{report.status}
                          {report.message ? <span> · {report.message}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          ) : null}
          <LatencyTrend points={tabData?.trend || api.trend} />
        </Panel>
      ) : null}

      {tab === "queues" ? (
        <div className="space-y-4">
          <Panel title="Queues & jobs">
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiCard label="Driver" value={tabData?.queue?.driver || infra?.queue?.driver || "—"} />
              <KpiCard label="Pending" value={String(tabData?.queue?.pending ?? infra?.queue?.pending ?? "—")} />
              <KpiCard label="Failed" value={String(tabData?.queue?.failed ?? infra?.queue?.failed ?? "—")} />
            </div>
            <p className="mt-3 text-sm text-slate-600">{tabData?.note}</p>
            <button type="button" className="mt-2 inline-block text-left text-sm font-medium text-[#185FA5]" onClick={() => setTab("health")}>
              Run live worker probe in Infrastructure Health →
            </button>
          </Panel>
          <Panel
            title={`Failed jobs (${tabData?.failed_jobs?.total ?? 0})`}
            action={
              (tabData?.failed_jobs?.total ?? 0) > 0 ? (
                <button
                  type="button"
                  className={`${SECONDARY_BTN_CLASS} px-3 py-1.5 text-xs disabled:opacity-50`}
                  disabled={clearFailedBusy}
                  onClick={() => void clearFailedJobs()}
                  title="Clear the failed list so you can watch for reappearance after a fix"
                >
                  {clearFailedBusy ? "Clearing…" : "Clear failed"}
                </button>
              ) : null
            }
          >
            {tabData?.failed_jobs?.data?.length ? (
              <div className="space-y-2">
                {tabData.failed_jobs.data.map((job) => (
                  <div key={job.id} className="rounded-lg border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
                      onClick={() =>
                        setSelectedFailedJobId((current) => current === job.id ? null : job.id)
                      }
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">
                          {job.display_name || job.job_name || `Failed job #${job.id}`}
                        </span>
                        <span className="text-xs text-slate-500">
                          Queue: {job.queue || "—"} · {job.connection || "—"} ·{" "}
                          {job.failed_at ? new Date(job.failed_at).toLocaleString() : "—"}
                        </span>
                      </span>
                      <span className="text-xs font-medium text-[#185FA5]">
                        {selectedFailedJobId === job.id ? "Hide details" : "Read error"}
                      </span>
                    </button>
                    {selectedFailedJobId === job.id ? (
                      <pre className="max-h-96 overflow-auto border-t border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-rose-100">
                        {job.exception || "No exception details were recorded."}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No failed jobs were found.</p>
            )}
            {tabData?.failed_jobs?.last_page > 1 ? (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Page {failedJobsPage} of {tabData.failed_jobs.last_page}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    disabled={failedJobsPage <= 1}
                    onClick={() => void loadTab("queues", failedJobsPage - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    disabled={failedJobsPage >= tabData.failed_jobs.last_page}
                    onClick={() => void loadTab("queues", failedJobsPage + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </Panel>
        </div>
      ) : null}

      {tab === "health" ? (
        <div className="space-y-4">
          <Panel
            title="Infrastructure health"
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={reverbBusy}
                  onClick={() => void sendReverbNotification()}
                  className={`${SECONDARY_BTN_CLASS} px-4 py-2 disabled:opacity-50`}
                >
                  {reverbBusy ? "Sending…" : "Send Reverb test"}
                </button>
                <PrimaryButton type="button" showIcon={false} onClick={() => void loadTab("health")} disabled={healthBusy}>
                  {healthBusy ? "Running…" : "Run tests"}
                </PrimaryButton>
              </div>
            }
          >
            <p className="mb-3 text-sm text-slate-600">
              Test this app pod, Reverb realtime, scheduler, queue workers, and sibling pods. Scheduler needs{" "}
              <code className="rounded bg-slate-100 px-1">schedule:run</code> every minute; queues need{" "}
              <code className="rounded bg-slate-100 px-1">queue:work</code> unless using the sync driver.
              Optional peer API bases are configured with <code className="rounded bg-slate-100 px-1">PLATFORM_PEER_HEALTH_URLS</code>.
            </p>
            {reverbTest ? (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${reverbTest.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                <p className="font-medium">{reverbTest.ok ? "Reverb broadcast sent" : "Reverb test failed"}</p>
                <p className="mt-1">{reverbTest.message}</p>
                {reverbTest.notification_id ? <p className="mt-1 text-xs opacity-80">Notification #{reverbTest.notification_id}</p> : null}
              </div>
            ) : null}
            {tabData?.checks ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <StatusBadge status={tabData.ok ? "ok" : "critical"} />
                  <span>Overall: <strong className="text-slate-900">{tabData.ok ? "Healthy" : "Issues found"}</strong></span>
                  {tabData.centrix_version_label || tabData.centrix_version ? (
                    <span>Centrix <strong className="text-slate-900">{tabData.centrix_version_label || `v${tabData.centrix_version}`}</strong></span>
                  ) : null}
                  <span>Host: {tabData.hostname ?? "—"}</span>
                  <span>Checked: {tabData.checked_at ? new Date(tabData.checked_at).toLocaleString() : "—"}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2.5">Check</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabData.checks.map((check) => (
                        <tr key={check.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 font-medium text-slate-900">{check.label}</td>
                          <td className="px-4 py-3"><StatusBadge status={check.ok === true ? "ok" : check.ok === false ? "critical" : null} /></td>
                          <td className="px-4 py-3 text-slate-600">{check.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">{healthBusy ? "Running infrastructure checks…" : "Run tests to probe this environment."}</p>
            )}
          </Panel>
          <p className="text-xs text-slate-500">
            Send Reverb test creates an in-app notification and broadcasts it to your private channel. Check that the bell updates without refreshing.
          </p>
        </div>
      ) : null}

    </CatalogPageShell>
  );
}
