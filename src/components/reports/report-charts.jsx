"use client";

import { formatKesCompact, formatShortDate } from "@/components/catalog/catalog-shared";
import { formatReportKes } from "@/lib/reports/format";
import { salesChannelLabel } from "@/lib/user-facing-labels";

/** Teal / sky / emerald palette — avoids generic purple chart defaults. */
export const CHART_COLORS = [
  "#0f766e",
  "#0369a1",
  "#047857",
  "#b45309",
  "#be123c",
  "#334155",
  "#0e7490",
  "#a16207",
];

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
    <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
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
          <span className="h-0.5 w-5 rounded bg-teal-700" /> This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded border border-dashed border-slate-400 bg-transparent" /> Last period
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full" role="img" aria-label="Sales trend">
        <path d={previousPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4" />
        <path d={currentPath} fill="none" stroke="#0f766e" strokeWidth="2.5" />
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
  const size = 168;
  const stroke = 26;
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
          strokeLinecap="butt"
        />,
      );
      acc.offset += dash;
      return acc;
    },
    { offset: 0, elements: [] },
  ).elements;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--theme-border, #e2e8f0)"
              strokeWidth={stroke}
            />
            {circleElements}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Total</p>
          <p className="text-sm font-semibold text-slate-800">{formatKesCompact(total)}</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5 text-sm">
        {segments.map((seg, i) => (
          <li key={seg.label ?? i} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: seg.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="truncate text-slate-700">{seg.label}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums text-slate-600">
              {formatKesCompact(seg.value)}
              {seg.sharePct != null ? (
                <span className="ml-1 text-xs text-slate-400">({seg.sharePct}%)</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Vertical bars — best for short date series.
 * @param {{ labelMode?: "auto" | "date" | "category" | "channel" }} props
 */
export function ReportBarChart({
  rows,
  labelKey,
  valueKey,
  title,
  labelMode = "auto",
  limit = 24,
  valueFrom = null,
  labelFrom = null,
  sort = "desc",
}) {
  if (!rows?.length) {
    return <ChartPlaceholder height={160} message="No chart data." />;
  }

  const aggregated = aggregateChartSeries(rows, labelKey, valueKey, {
    labelMode,
    limit,
    valueFrom,
    labelFrom,
    sort,
  });
  if (!aggregated.length) {
    return <ChartPlaceholder height={160} message="No chart data." />;
  }

  const max = Math.max(...aggregated.map((p) => p.value), 1);
  const chartHeight = 176;
  const barAreaHeight = chartHeight - 28;

  return (
    <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3">
        {title ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : null}
        <p className="mt-0.5 text-xs text-slate-500">Compare values across the selected period</p>
      </div>
      <div className="p-4">
        <div className="flex gap-1.5" style={{ height: chartHeight }}>
          {aggregated.map((p, i) => (
            <div
              key={`${p.label}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              style={{ height: chartHeight }}
            >
              <span className="max-w-full truncate text-[9px] font-medium tabular-nums text-slate-500">
                {formatKesCompact(p.value)}
              </span>
              <div
                className="w-full min-w-[4px] rounded-t-md"
                style={{
                  height: Math.max(4, (p.value / max) * barAreaHeight),
                  background: `linear-gradient(180deg, ${CHART_COLORS[i % CHART_COLORS.length]} 0%, ${CHART_COLORS[i % CHART_COLORS.length]}cc 100%)`,
                }}
                title={`${p.label}: ${formatReportKes(p.value)}`}
              />
              <span className="max-w-full truncate text-[9px] text-slate-500" title={p.label}>
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Horizontal ranking bars — best for users, products, customers, categories.
 */
export function ReportHorizontalBarChart({
  rows,
  labelKey,
  valueKey,
  title,
  labelMode = "category",
  limit = 12,
  valueFormat = "money",
  valueFrom = null,
  labelFrom = null,
  sort = "desc",
}) {
  if (!rows?.length) {
    return (
      <div className="theme-panel rounded-xl border p-4 shadow-sm">
        {title ? <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3> : null}
        <ChartPlaceholder height={160} message="No chart data." />
      </div>
    );
  }

  const aggregated = aggregateChartSeries(rows, labelKey, valueKey, {
    labelMode,
    limit,
    valueFrom,
    labelFrom,
    sort,
  });
  if (!aggregated.length) {
    return (
      <div className="theme-panel rounded-xl border p-4 shadow-sm">
        {title ? <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3> : null}
        <ChartPlaceholder height={160} message="No chart data." />
      </div>
    );
  }

  const max = Math.max(...aggregated.map((p) => p.value), 1);
  const total = aggregated.reduce((s, p) => s + p.value, 0);

  return (
    <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-teal-50/80 via-white to-sky-50/60 px-4 py-3">
        {title ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : null}
        <p className="mt-0.5 text-xs text-slate-500">
          Ranked comparison · top {aggregated.length}
          {total > 0 && valueFormat === "money" ? ` · ${formatKesCompact(total)} shown` : null}
        </p>
      </div>
      <ol className="space-y-3 p-4">
        {aggregated.map((p, i) => {
          const pct = max > 0 ? (p.value / max) * 100 : 0;
          const share = total > 0 ? Math.round((p.value / total) * 1000) / 10 : 0;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <li key={`${p.label}-${i}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2">
              <span className="text-center text-xs font-semibold tabular-nums text-slate-400">{i + 1}</span>
              <div className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800" title={p.label}>
                    {p.label}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{share}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`,
                      background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`,
                    }}
                    title={`${p.label}: ${formatReportKes(p.value)}`}
                  />
                </div>
              </div>
              <span className="min-w-[4.5rem] text-right text-xs font-semibold tabular-nums text-slate-700">
                {valueFormat === "count"
                  ? formatCount(p.value)
                  : formatKesCompact(p.value)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function ReportViewModeToggle({ value, onChange, disabled = false }) {
  const options = [
    { id: "table", label: "Table" },
    { id: "charts", label: "Graphs & charts" },
    { id: "both", label: "Both" },
  ];
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-sm"
      role="group"
      aria-label="Report view mode"
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(opt.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              active
                ? "bg-white text-teal-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Renders definition.charts against a row set.
 */
export function ReportChartsSection({ charts, rows, loading = false }) {
  if (!charts?.length) return null;

  if (loading) {
    return (
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {charts.map((chart, i) => (
          <div key={chart.title ?? chart.valueKey ?? i} className="theme-panel rounded-xl border p-4 shadow-sm">
            <ChartPlaceholder height={180} message="Building charts…" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      {charts.map((chart, index) => {
        const key = chart.title ?? `${chart.type}-${chart.valueKey}-${index}`;
        if (chart.type === "bar") {
          return (
            <ReportBarChart
              key={key}
              rows={rows}
              labelKey={chart.labelKey}
              valueKey={chart.valueKey}
              title={chart.title}
              labelMode={chart.labelMode ?? "auto"}
              limit={chart.limit ?? 24}
              valueFrom={chart.valueFrom}
              labelFrom={chart.labelFrom}
              sort={chart.sort ?? "desc"}
            />
          );
        }
        if (chart.type === "hbar") {
          return (
            <ReportHorizontalBarChart
              key={key}
              rows={rows}
              labelKey={chart.labelKey}
              valueKey={chart.valueKey}
              title={chart.title}
              labelMode={chart.labelMode ?? "category"}
              limit={chart.limit ?? 12}
              valueFormat={chart.valueFormat ?? "money"}
              valueFrom={chart.valueFrom}
              labelFrom={chart.labelFrom}
              sort={chart.sort ?? "desc"}
            />
          );
        }
        if (chart.type === "donut") {
          const grouped = aggregateChartSeries(rows, chart.labelKey, chart.valueKey, {
            labelMode: chart.labelMode ?? "category",
            limit: chart.limit ?? 8,
            valueFrom: chart.valueFrom,
            labelFrom: chart.labelFrom,
            sort: chart.sort ?? "desc",
          });
          const total = grouped.reduce((s, g) => s + g.value, 0);
          const segments = grouped.map((g, i) => ({
            label: g.label,
            value: g.value,
            sharePct: total > 0 ? Math.round((g.value / total) * 1000) / 10 : 0,
            color: CHART_COLORS[i % CHART_COLORS.length],
          }));
          return (
            <div key={key} className="theme-panel overflow-hidden rounded-xl border shadow-sm">
              <div className="border-b border-slate-100 bg-gradient-to-br from-sky-50/70 via-white to-teal-50/50 px-4 py-3">
                {chart.title ? <h3 className="text-sm font-semibold text-slate-900">{chart.title}</h3> : null}
                <p className="mt-0.5 text-xs text-slate-500">Share of the selected measure</p>
              </div>
              <div className="p-4">
                <DonutChart segments={segments} />
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export function formatChartLabel(raw, labelMode = "auto") {
  if (raw == null || raw === "") return "—";
  const text = String(raw);
  if (labelMode === "channel") return salesChannelLabel(text) || text;
  if (labelMode === "category") return text;
  if (labelMode === "date") {
    return looksLikeDate(text) ? formatShortDate(text.slice(0, 10)) : text;
  }
  // auto: date-like → short date, else as-is
  if (looksLikeDate(text)) return formatShortDate(text.slice(0, 10));
  return text;
}

export function aggregateChartSeries(
  rows,
  labelKey,
  valueKey,
  { labelMode = "auto", limit = 24, valueFrom = null, labelFrom = null, sort = "desc" } = {},
) {
  const map = new Map();
  for (const row of rows ?? []) {
    const label = labelFrom
      ? String(labelFrom(row) ?? "—")
      : formatChartLabel(row?.[labelKey], labelMode);
    const val = valueFrom
      ? Number(valueFrom(row)) || 0
      : Number(row?.[valueKey]) || 0;
    map.set(label, (map.get(label) ?? 0) + val);
  }
  const series = [...map.entries()].map(([label, value]) => ({ label, value }));
  series.sort((a, b) => (sort === "asc" ? a.value - b.value : b.value - a.value));
  return series.slice(0, Math.max(1, limit));
}

function looksLikeDate(text) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(text));
}

function formatCount(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}

function ChartPlaceholder({ height, message }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-500" style={{ minHeight: height }}>
      {message}
    </div>
  );
}

export function channelLabel(channel) {
  if (!channel) return "Other";
  return salesChannelLabel(channel);
}
