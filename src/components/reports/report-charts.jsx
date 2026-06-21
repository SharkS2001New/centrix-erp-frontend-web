"use client";

import { formatKesCompact, formatShortDate } from "@/components/catalog/catalog-shared";
import { formatReportKes } from "@/lib/reports/format";

const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#64748b"];

export function ChangeBadge({ pct }) {
  if (pct == null || Number.isNaN(Number(pct))) return null;
  const n = Number(pct);
  const positive = n >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      }`}
    >
      {positive ? "+" : ""}
      {n.toFixed(1)}%
    </span>
  );
}

export function HubKpiCard({ label, value, changePct }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <ChangeBadge pct={changePct} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{formatReportKes(value)}</p>
    </div>
  );
}

export function SalesTrendChart({ points, loading }) {
  if (loading) {
    return <ChartPlaceholder height={220} message="Loading trend…" />;
  }
  if (!points?.length) {
    return <ChartPlaceholder height={220} message="No sales in this period." />;
  }

  const width = 640;
  const height = 200;
  const padX = 8;
  const padY = 16;
  const max = Math.max(...points.flatMap((p) => [p.current ?? 0, p.previous ?? 0]), 1);

  const toX = (i) => padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2);
  const toY = (v) => height - padY - (v / max) * (height - padY * 2);

  const currentPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.current ?? 0).toFixed(1)}`).join(" ");
  const previousPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.previous ?? 0).toFixed(1)}`)
    .join(" ");

  const tickEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-indigo-500" /> This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded border border-dashed border-slate-400 bg-transparent" /> Last period
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full" role="img" aria-label="Sales trend">
        <path d={previousPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4" />
        <path d={currentPath} fill="none" stroke="#6366f1" strokeWidth="2.5" />
        {points.map((p, i) =>
          i % tickEvery === 0 || i === points.length - 1 ? (
            <text key={p.date ?? i} x={toX(i)} y={height + 18} textAnchor="middle" className="fill-slate-500 text-[10px]">
              {p.label ?? formatShortDate(p.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function DonutChart({ segments, loading, emptyMessage = "No data for this period." }) {
  if (loading) {
    return <ChartPlaceholder height={180} message="Loading…" />;
  }
  if (!segments?.length) {
    return <ChartPlaceholder height={180} message={emptyMessage} />;
  }

  const total = segments.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const size = 140;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const circleElements = segments.reduce(
    (acc, seg, i) => {
      const value = Number(seg.value) || 0;
      const pct = total > 0 ? value / total : 0;
      const dash = pct * circumference;
      acc.elements.push(
        <circle
          key={seg.label ?? i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={seg.color ?? CHART_COLORS[i % CHART_COLORS.length]}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={-acc.offset}
        />,
      );
      acc.offset += dash;
      return acc;
    },
    { offset: 0, elements: [] },
  ).elements;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {circleElements}
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {segments.map((seg, i) => (
          <li key={seg.label ?? i} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="truncate text-slate-700">{seg.label}</span>
            </span>
            <span className="shrink-0 text-right text-slate-600">
              {formatKesCompact(seg.value)}
              {seg.sharePct != null ? <span className="ml-1 text-xs text-slate-400">({seg.sharePct}%)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportBarChart({ rows, labelKey, valueKey, title }) {
  if (!rows?.length) {
    return <ChartPlaceholder height={160} message="No chart data." />;
  }

  const aggregated = aggregateByKey(rows, labelKey, valueKey);
  const max = Math.max(...aggregated.map((p) => p.value), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {title ? <h3 className="mb-3 text-sm font-medium text-slate-900">{title}</h3> : null}
      <div className="flex h-44 items-end gap-1">
        {aggregated.map((p) => (
          <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-indigo-500/80"
              style={{ height: `${Math.max(6, (p.value / max) * 100)}%` }}
              title={`${p.label}: ${formatReportKes(p.value)}`}
            />
            <span className="max-w-full truncate text-[9px] text-slate-500">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function aggregateByKey(rows, labelKey, valueKey) {
  const map = new Map();
  for (const row of rows) {
    const label = String(row[labelKey] ?? "—").slice(0, 8);
    const val = Number(row[valueKey]) || 0;
    map.set(label, (map.get(label) ?? 0) + val);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function ChartPlaceholder({ height, message }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-500" style={{ minHeight: height }}>
      {message}
    </div>
  );
}

export function channelLabel(channel) {
  const map = {
    pos: "POS",
    wholesale: "Wholesale",
    mobile: "Mobile Sales",
    online: "Online",
    route: "Route",
  };
  return map[channel?.toLowerCase?.()] ?? channel ?? "Other";
}

export { CHART_COLORS };
