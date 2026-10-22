"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { notifyError, notifySuccess } from "@/lib/notify";
import { classifyLatency } from "@/lib/latency-split";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "api", label: "API Endpoints" },
  { id: "database", label: "Database" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "frontend", label: "Frontend" },
  { id: "queues", label: "Queues & Jobs" },
  { id: "synthetic", label: "Synthetic Tests" },
  { id: "diagnostics", label: "Diagnostics" },
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

function formatSec(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(2)} s`;
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

function truncateSql(sql, max = 100) {
  const text = String(sql ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
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
  const [synthBusy, setSynthBusy] = useState(false);

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

  const loadTab = useCallback(async (id) => {
    if (id === "overview") {
      setTabData(null);
      return;
    }
    const path =
      id === "api"
        ? `/admin/platform-speed/api?range=${range}`
        : id === "database"
          ? `/admin/platform-speed/database?range=${range}`
          : id === "infrastructure"
            ? "/admin/platform-speed/infrastructure"
            : id === "queues"
              ? "/admin/platform-speed/queues"
              : id === "frontend"
                ? "/admin/platform-speed/frontend"
                : id === "synthetic"
                  ? "/admin/platform-speed/synthetic"
                  : `/admin/platform-speed/diagnostics?range=${range}`;
    try {
      const res = await apiRequest(path, { loading: false });
      setTabData(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load tab");
      setTabData(null);
    }
  }, [range]);

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

  async function runSyntheticNow() {
    setSynthBusy(true);
    try {
      await apiRequest("/admin/platform-speed/synthetic/run", { method: "POST", body: {} });
      notifySuccess("Synthetic checks ran.");
      await loadTab("synthetic");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Synthetic run failed");
    } finally {
      setSynthBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title="ERP Speed"
      subtitle="Monitor API latency, database queries, infrastructure, queues, and synthetic checks — real data only."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={inputClassName}
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
          <PrimaryButton type="button" showIcon={false} onClick={() => void loadOverview()} disabled={loading}>
            {loading ? "Measuring…" : "Measure"}
          </PrimaryButton>
        </div>
      }
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "ERP Speed" }]} />

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
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StatusBadge status={result?.status} />
            <span>Probe {formatMs(result?.server_ms)}</span>
            {clientProbe ? <span>· Client RTT {formatMs(clientProbe.clientRttMs)}</span> : null}
          </div>

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
              value={formatMs(result?.database?.app_fingerprints?.query_latency_ms)}
              hint="App listener avg"
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
            <KpiCard label="DB probe" value={formatMs(result?.latency_probe?.db_ms)} hint="Live SELECT 1" />
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
                      <th className="py-1 pr-2">Avg</th>
                      <th className="py-1 pr-2">p95</th>
                      <th className="py-1">Req</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(api.slowest || []).slice(0, 5).map((row) => (
                      <tr key={`${row.method}-${row.route_key}`} className="border-t border-slate-100">
                        <td className="max-w-[12rem] truncate py-1.5 pr-2 font-mono text-[11px]">
                          {row.method} {row.route_key}
                        </td>
                        <td className="py-1.5 pr-2">{formatMs(row.avg_ms)}</td>
                        <td className="py-1.5 pr-2">{formatMs(row.p95_ms)}</td>
                        <td className="py-1.5">{row.count}</td>
                      </tr>
                    ))}
                    {(api.slowest || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-3 text-slate-500">
                          No endpoint aggregates yet.
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
              <Link href="/platform/health" className="mt-3 inline-block text-xs font-medium text-[#185FA5] hover:underline">
                Open Infrastructure Health →
              </Link>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              title="Top database queries"
              action={
                <Link href="/platform/slow-queries" className="text-xs font-medium text-[#185FA5] hover:underline">
                  Slow queries
                </Link>
              }
            >
              <ul className="space-y-2 text-xs">
                {(result?.slow_queries?.queries || []).slice(0, 5).map((q, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 px-2 py-2">
                    <p className="font-mono text-[11px] text-slate-700">{truncateSql(q.sql || q.digest_text)}</p>
                    <p className="mt-1 text-slate-500">
                      avg {formatSec(q.avg_sec)} · max {formatSec(q.max_sec)} · n {q.count ?? "—"}
                    </p>
                  </li>
                ))}
                {(result?.slow_queries?.queries || []).length === 0 ? (
                  <li className="text-slate-500">{result?.slow_queries?.empty_hint || "No digests."}</li>
                ) : null}
              </ul>
            </Panel>
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
        <Panel title="API endpoints">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Route</th>
                  <th className="py-2 pr-3">Count</th>
                  <th className="py-2 pr-3">Errors</th>
                  <th className="py-2 pr-3">Avg</th>
                  <th className="py-2 pr-3">p95</th>
                  <th className="py-2">Max</th>
                </tr>
              </thead>
              <tbody>
                {(tabData?.slowest || api.slowest || []).map((row) => (
                  <tr key={`${row.method}-${row.route_key}`} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">
                      {row.method} {row.route_key}
                    </td>
                    <td className="py-2 pr-3">{row.count}</td>
                    <td className="py-2 pr-3">{row.error_count}</td>
                    <td className="py-2 pr-3">{formatMs(row.avg_ms)}</td>
                    <td className="py-2 pr-3">{formatMs(row.p95_ms)}</td>
                    <td className="py-2">{formatMs(row.max_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(tabData?.slowest || api.slowest || []).length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No aggregates yet. Traffic is recorded per request and flushed every minute (
                <code className="text-xs">erp:flush-speed-metrics</code>).
              </p>
            ) : null}
          </div>
          <LatencyTrend points={tabData?.trend || api.trend} />
        </Panel>
      ) : null}

      {tab === "database" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="App query fingerprints">
            <ul className="space-y-2 text-xs">
              {(tabData?.app_fingerprints?.fingerprints || []).map((q) => (
                <li key={q.fingerprint} className="rounded-lg bg-slate-50 px-2 py-2">
                  <p className="font-mono">{truncateSql(q.sql_preview, 140)}</p>
                  <p className="mt-1 text-slate-500">
                    avg {formatMs(q.avg_ms)} · slow {q.slow_count} · n+1 hits {q.n_plus_one_hits}
                  </p>
                </li>
              ))}
              {(tabData?.app_fingerprints?.fingerprints || []).length === 0 ? (
                <li className="text-slate-500">No fingerprints yet (DB listen aggregates after traffic + flush).</li>
              ) : null}
            </ul>
          </Panel>
          <Panel
            title="MySQL performance_schema digests"
            action={
              <Link href="/platform/slow-queries" className="text-xs font-medium text-[#185FA5]">
                Open tool
              </Link>
            }
          >
            <ul className="space-y-2 text-xs">
              {(tabData?.mysql_digests?.queries || result?.slow_queries?.queries || []).map((q, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-2 py-2 font-mono">
                  {truncateSql(q.sql || q.digest_text, 140)}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "infrastructure" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "CPU %", data: tabData?.cpu || infra.cpu },
            { label: "Memory", data: tabData?.memory || infra.memory, valueKey: "php_memory_mb", suffix: " MB" },
            { label: "Load", data: tabData?.load || infra.load, valueKey: "load_1" },
            { label: "Disk", data: tabData?.disk || infra.disk, valueKey: "used_percent", suffix: "%" },
            { label: "Redis", data: tabData?.redis || infra.redis, valueKey: "ping_ms", suffix: " ms ping" },
            { label: "MySQL", data: tabData?.mysql || infra.mysql, valueKey: "ping_ms", suffix: " ms ping" },
          ].map((card) => (
            <KpiCard
              key={card.label}
              label={card.label}
              unavailable={card.data && card.data.available === false}
              value={
                card.data?.available === false
                  ? "—"
                  : card.valueKey && card.data?.[card.valueKey] != null
                    ? `${card.data[card.valueKey]}${card.suffix || ""}`
                    : "—"
              }
              hint={card.data?.note}
            />
          ))}
          <Panel title="Dependency checks">
            <ul className="space-y-1 text-sm">
              {((tabData?.health || infra.health)?.checks || healthChecks).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{c.label || c.id}</span>
                  <span className="text-xs font-semibold">{c.ok === true ? "Good" : c.ok === false ? "Fail" : "N/A"}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "frontend" ? (
        <Panel title="Client slow reports">
          <p className="mb-3 text-sm text-slate-600">
            {(tabData?.note || result?.slow_issues) &&
              "Browser reports when server-side work looks slow (≥5s X-Response-Time). Not Core Web Vitals."}
          </p>
          <ul className="space-y-2 text-sm">
            {(tabData?.slow_issues?.recent || result?.slow_issues?.recent || []).map((issue) => (
              <li key={issue.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <span className="font-mono text-xs">
                  {issue.http_method} {issue.api_path}
                </span>
                <span className="ml-2 text-slate-500">{formatMs(issue.duration_ms)}</span>
              </li>
            ))}
          </ul>
          <Link href="/platform/system-issues?kind=slow" className="mt-3 inline-block text-sm font-medium text-[#185FA5]">
            Open system issues →
          </Link>
        </Panel>
      ) : null}

      {tab === "queues" ? (
        <Panel title="Queues & jobs">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label="Driver" value={tabData?.queue?.driver || infra?.queue?.driver || "—"} />
            <KpiCard label="Pending" value={String(tabData?.queue?.pending ?? infra?.queue?.pending ?? "—")} />
            <KpiCard label="Failed" value={String(tabData?.queue?.failed ?? infra?.queue?.failed ?? "—")} />
          </div>
          <p className="mt-3 text-sm text-slate-600">{tabData?.note}</p>
          <Link href="/platform/health" className="mt-2 inline-block text-sm font-medium text-[#185FA5]">
            Run live worker probe on Health →
          </Link>
        </Panel>
      ) : null}

      {tab === "synthetic" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="button" showIcon={false} disabled={synthBusy} onClick={() => void runSyntheticNow()}>
              {synthBusy ? "Running…" : "Run due checks now"}
            </PrimaryButton>
            <span className="text-sm text-slate-500">
              {tabData?.enabled === false ? "Synthetic disabled in config" : "Safe GET/HEAD checks only"}
            </span>
          </div>
          <Panel title="Configured checks">
            <ul className="space-y-2 text-sm">
              {(tabData?.checks || []).map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <span>
                    <span className="font-semibold">{c.name}</span>{" "}
                    <span className="font-mono text-xs text-slate-600">
                      {c.method} {c.path}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">every {c.interval_seconds}s</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Recent results">
            <ul className="space-y-1 text-xs">
              {(tabData?.results || []).map((r) => (
                <li key={r.id} className="flex justify-between gap-2 border-t border-slate-50 py-1.5">
                  <span className={r.ok ? "text-emerald-700" : "text-red-700"}>{r.ok ? "OK" : "Fail"}</span>
                  <span className="font-mono">#{r.check_id}</span>
                  <span>{formatMs(r.total_ms)}</span>
                  <span className="text-slate-500">{r.status_code ?? r.error}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "diagnostics" ? (
        <Panel title="Recommendations">
          <ul className="space-y-3">
            {(tabData?.items || result?.diagnostics || []).map((d, i) => (
              <li key={i} className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{d.severity}</p>
                <p className="font-semibold text-slate-900">{d.title}</p>
                <p className="text-sm text-slate-600">{d.detail}</p>
                {d.href ? (
                  <Link href={d.href} className="mt-1 inline-block text-sm font-medium text-[#185FA5]">
                    Open →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Flush: <code>php artisan erp:flush-speed-metrics</code> · Synthetic:{" "}
            <code>php artisan erp:run-speed-synthetic</code>
          </div>
          <button type="button" className={`${SECONDARY_BTN_CLASS} mt-3`} onClick={() => void loadOverview()}>
            Refresh overview
          </button>
        </Panel>
      ) : null}
    </CatalogPageShell>
  );
}
