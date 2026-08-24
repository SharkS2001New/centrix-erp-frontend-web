"use client";

import { CHART_COLORS } from "@/components/reports/report-charts";
import { formatShortDate } from "@/components/catalog/catalog-shared";

export function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-KE");
}

function ChartPlaceholder({ height = 180, message = "No data for this period." }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500"
      style={{ minHeight: height }}
    >
      {message}
    </div>
  );
}

export function UsageTrendChart({ points, loading }) {
  if (loading) return <ChartPlaceholder message="Loading trend…" />;
  if (!points?.length) return <ChartPlaceholder message="No usage in this period." />;

  const width = 720;
  const height = 200;
  const padX = 12;
  const padY = 18;
  const maxRequests = Math.max(...points.map((p) => Number(p.requests) || 0), 1);
  const maxTokens = Math.max(...points.map((p) => Number(p.total_tokens) || 0), 1);
  const toX = (i) => padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2);
  const toYReq = (v) => height - padY - (v / maxRequests) * (height - padY * 2);
  const toYTok = (v) => height - padY - (v / maxTokens) * (height - padY * 2);
  const reqPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toYReq(Number(p.requests) || 0).toFixed(1)}`)
    .join(" ");
  const tokPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toYTok(Number(p.total_tokens) || 0).toFixed(1)}`)
    .join(" ");
  const tickEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Usage over time</h3>
        <p className="mt-0.5 text-xs text-slate-500">Requests and tokens by day</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded bg-teal-700" /> Requests
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded border border-dashed border-sky-600" /> Tokens
          </span>
        </div>
        <svg viewBox={`0 0 ${width} ${height + 22}`} className="w-full" role="img" aria-label="AI usage trend">
          <path d={tokPath} fill="none" stroke="#0284c7" strokeWidth="2" strokeDasharray="5 4" />
          <path d={reqPath} fill="none" stroke="#0f766e" strokeWidth="2.5" />
          {points.map((p, i) =>
            i % tickEvery === 0 || i === points.length - 1 ? (
              <text key={p.day ?? i} x={toX(i)} y={height + 16} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {formatShortDate(p.day)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}

export function UsageRankChart({ rows, labelKey, valueKey, title, limit = 10, valueFormat = "count" }) {
  const list = (rows ?? []).slice(0, limit);
  if (!list.length) {
    return (
      <div className="theme-panel rounded-xl border p-4 shadow-sm">
        {title ? <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3> : null}
        <ChartPlaceholder height={140} />
      </div>
    );
  }

  const max = Math.max(...list.map((r) => Number(r[valueKey]) || 0), 1);
  const total = list.reduce((sum, r) => sum + (Number(r[valueKey]) || 0), 0);

  return (
    <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-teal-50/80 via-white to-sky-50/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">Top {list.length}</p>
      </div>
      <ol className="space-y-3 p-4">
        {list.map((row, i) => {
          const value = Number(row[valueKey]) || 0;
          const pct = max > 0 ? (value / max) * 100 : 0;
          const share = total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const label = row[labelKey] ?? "—";
          return (
            <li key={`${label}-${i}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2">
              <span className="text-center text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
              <div className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800" title={label}>
                    {label}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{share}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                      background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
                    }}
                  />
                </div>
              </div>
              <span className="min-w-[4.5rem] text-right text-xs font-semibold tabular-nums text-slate-700">
                {valueFormat === "usd" ? formatUsd(value) : formatCount(value)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function UsageDonutChart({ segments, title = "By provider" }) {
  const list = (segments ?? []).filter((s) => (Number(s.value) || 0) > 0);
  if (!list.length) {
    return (
      <div className="theme-panel rounded-xl border p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
        <ChartPlaceholder height={140} />
      </div>
    );
  }

  const total = list.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const size = 148;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let runningOffset = 0;
  const circles = list.map((seg, i) => {
    const value = Number(seg.value) || 0;
    const dash = total > 0 ? (value / total) * circumference : 0;
    const dashOffset = -runningOffset;
    runningOffset += dash;
    return (
      <circle
        key={seg.label ?? i}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={seg.color ?? CHART_COLORS[i % CHART_COLORS.length]}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeDashoffset={dashOffset}
      />
    );
  });

  return (
    <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-6 p-4">
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--theme-border, #e2e8f0)"
                strokeWidth={stroke}
              />
              {circles}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Requests</p>
            <p className="text-sm font-semibold text-slate-800">{formatCount(total)}</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-sm">
          {list.map((seg, i) => (
            <li key={seg.label ?? i} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: seg.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="truncate text-slate-700">{seg.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-600">{formatCount(seg.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
