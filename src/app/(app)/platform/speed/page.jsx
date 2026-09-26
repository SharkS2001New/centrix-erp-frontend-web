"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  PrimaryButton,
} from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { notifyError } from "@/lib/notify";
import { classifyLatency } from "@/lib/latency-split";

function formatCheckedAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

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

function CheckPill({ ok }) {
  const label = ok === true ? "OK" : ok === false ? "Fail" : "N/A";
  const className =
    ok === true
      ? "bg-emerald-100 text-emerald-800"
      : ok === false
        ? "bg-red-100 text-red-800"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function truncateSql(sql, max = 120) {
  const text = String(sql ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export default function PlatformSpeedPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [clientProbe, setClientProbe] = useState(null);

  const measure = useCallback(async () => {
    setLoading(true);
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const res = await apiRequest("/admin/platform-speed", { loading: false });
      const clientRttMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      const serverMs = res?.server_ms != null ? Number(res.server_ms) : null;
      setResult(res);
      setClientProbe(classifyLatency({ clientRttMs, serverMs }));
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Speed check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void measure();
  }, [measure]);

  const healthChecks = Array.isArray(result?.health?.checks) ? result.health.checks : [];
  const healthPass = healthChecks.filter((c) => c.ok === true).length;
  const healthFail = healthChecks.filter((c) => c.ok === false).length;
  const healthNa = healthChecks.filter((c) => c.ok == null).length;
  const queries = Array.isArray(result?.slow_queries?.queries) ? result.slow_queries.queries : [];
  const recentIssues = Array.isArray(result?.slow_issues?.recent) ? result.slow_issues.recent : [];
  const likelyHint =
    clientProbe?.likely === "api"
      ? "Likely API / server"
      : clientProbe?.likely === "network"
        ? "Likely network"
        : null;

  return (
    <CatalogPageShell
      title="ERP Speed"
      subtitle="Live latency probe plus infra health, slow MySQL digests, and client-reported slow requests."
      action={
        <PrimaryButton type="button" showIcon={false} onClick={() => void measure()} disabled={loading}>
          {loading ? "Measuring…" : result ? "Measure now" : "Measure"}
        </PrimaryButton>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "ERP Speed" },
        ]}
      />

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p>
          One refresh answers whether Centrix feels slow and where to look next. Deep tools stay on{" "}
          <Link href="/platform/health" className="font-medium text-[#185FA5] hover:underline">
            Infrastructure health
          </Link>
          ,{" "}
          <Link href="/platform/slow-queries" className="font-medium text-[#185FA5] hover:underline">
            Slow queries
          </Link>
          , and{" "}
          <Link
            href="/platform/system-issues?kind=slow"
            className="font-medium text-[#185FA5] hover:underline"
          >
            System issues (slow)
          </Link>
          .
        </p>
        {result?.checked_at ? (
          <p className="mt-2 text-xs text-slate-500">Last checked: {formatCheckedAt(result.checked_at)}</p>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Overall"
              value={<StatusBadge status={result.status} />}
              hint={
                result.status === "ok"
                  ? "No active speed alarms"
                  : result.status === "degraded"
                    ? "Review slow queries or client reports"
                    : "Infra or database probe failed"
              }
            />
            <KpiCard
              label="API RTT (client)"
              value={formatMs(clientProbe?.client_rtt_ms)}
              hint={likelyHint}
            />
            <KpiCard
              label="Server time"
              value={formatMs(clientProbe?.server_ms ?? result.server_ms)}
              hint={
                clientProbe?.network_estimate_ms != null
                  ? `Network ~${formatMs(clientProbe.network_estimate_ms)}`
                  : "From this snapshot request"
              }
            />
            <KpiCard
              label="DB probe"
              value={formatMs(result.latency_probe?.db_ms)}
              hint={
                result.latency_probe?.redis_skipped
                  ? "Redis not in use"
                  : `Redis ${formatMs(result.latency_probe?.redis_ms)}`
              }
            />
            <KpiCard
              label="Open slow issues"
              value={String(result.slow_issues?.active ?? 0)}
              hint={`${result.slow_issues?.open ?? 0} open · ${result.slow_issues?.acknowledged ?? 0} ack`}
            />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Infrastructure</h2>
                <p className="text-xs text-slate-500">
                  {healthPass} OK · {healthFail} fail · {healthNa} N/A
                  {result.health?.hostname ? ` · host ${result.health.hostname}` : ""}
                </p>
              </div>
              <Link
                href="/platform/health"
                className="text-sm font-medium text-[#185FA5] hover:underline"
              >
                Open health →
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {healthChecks.map((check) => (
                <div
                  key={check.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"
                  title={check.detail}
                >
                  <CheckPill ok={check.ok} />
                  <span>{check.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Top slow queries</h2>
                <p className="text-xs text-slate-500">
                  {result.slow_queries?.available === false
                    ? result.slow_queries?.reason || "performance_schema unavailable"
                    : "MySQL digests (top 5 by total time)"}
                </p>
              </div>
              <Link
                href="/platform/slow-queries"
                className="text-sm font-medium text-[#185FA5] hover:underline"
              >
                Open slow queries →
              </Link>
            </div>
            {queries.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No slow digests to show.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">SQL</th>
                    <th className="px-4 py-2.5">Avg</th>
                    <th className="px-4 py-2.5">Max</th>
                    <th className="px-4 py-2.5">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {queries.map((row) => (
                    <tr key={row.digest || row.sql} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        {truncateSql(row.sql)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatSec(row.avg_sec)}</td>
                      <td className="px-4 py-3 text-slate-700">{formatSec(row.max_sec)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.exec_count ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Recent slow client reports</h2>
                <p className="text-xs text-slate-500">
                  Open / acknowledged requests that exceeded the slow threshold
                </p>
              </div>
              <Link
                href="/platform/system-issues?kind=slow"
                className="text-sm font-medium text-[#185FA5] hover:underline"
              >
                Open slow issues →
              </Link>
            </div>
            {recentIssues.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No active slow reports.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">Path</th>
                    <th className="px-4 py-2.5">Duration</th>
                    <th className="px-4 py-2.5">Org</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIssues.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 text-slate-800">
                        <span className="font-mono text-xs">
                          {[row.http_method, row.api_path].filter(Boolean).join(" ") || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatMs(row.duration_ms)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.organization?.company_code || row.organization?.org_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatCheckedAt(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-500">Measuring…</p>
      ) : (
        <p className="text-sm text-slate-500">Click Measure now to probe this environment.</p>
      )}
    </CatalogPageShell>
  );
}
