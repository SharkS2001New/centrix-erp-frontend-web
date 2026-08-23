"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { aiTrainingApiBase } from "@/lib/platform-ai-training";
import { notifyError } from "@/lib/notify";

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border px-3 py-2 theme-panel">
      <p className="text-xs theme-subtext">{label}</p>
      <p className="mt-0.5 text-lg font-semibold theme-heading">{value ?? "—"}</p>
    </div>
  );
}

export function PlatformAiUsagePanel() {
  const apiBase = aiTrainingApiBase();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiBase}/usage`);
      setData(res);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to load AI usage.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm theme-subtext">Loading usage…</p>;
  }

  if (!data?.available) {
    return (
      <p className="text-sm theme-subtext">
        {data?.message || "AI usage metrics are not available yet."}
      </p>
    );
  }

  const summary = data.summary ?? {};

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold theme-heading">Assistant adoption</h2>
          <p className="mt-0.5 text-xs theme-subtext">
            {data.from} → {data.to} · tool-chat requests across tenants
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border px-3 py-1.5 text-xs theme-heading hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Requests" value={summary.requests} />
        <Stat label="Active orgs" value={summary.active_organizations} />
        <Stat label="Avg latency (ms)" value={summary.avg_latency_ms} />
        <Stat label="Errors" value={summary.error_count} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4 theme-panel">
          <h3 className="text-sm font-medium theme-heading">Top tools</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(data.top_tools ?? []).length ? (
              data.top_tools.map((row) => (
                <li key={row.tool} className="flex justify-between gap-3">
                  <span className="font-mono text-xs theme-heading">{row.tool}</span>
                  <span className="theme-subtext">{row.count}</span>
                </li>
              ))
            ) : (
              <li className="theme-subtext">No tool calls yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border p-4 theme-panel">
          <h3 className="text-sm font-medium theme-heading">By organization</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(data.by_organization ?? []).length ? (
              data.by_organization.slice(0, 10).map((row) => (
                <li key={row.organization_id} className="flex justify-between gap-3">
                  <span className="truncate theme-heading">{row.organization_name}</span>
                  <span className="shrink-0 theme-subtext">{row.requests}</span>
                </li>
              ))
            ) : (
              <li className="theme-subtext">No org usage yet.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border p-4 theme-panel">
        <h3 className="text-sm font-medium theme-heading">Default tool rollout</h3>
        <p className="mt-1 text-xs theme-subtext">
          Platform defaults from config — override per org under module_settings.ai.tools.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.default_tools ?? {}).map(([name, enabled]) => (
            <span
              key={name}
              className={`rounded-full px-2.5 py-1 text-xs ${
                enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
