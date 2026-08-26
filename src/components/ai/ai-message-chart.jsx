"use client";

import { CHART_COLORS } from "@/components/reports/report-charts";

/**
 * Compact bar / donut chart for Centrix AI replies.
 *
 * @param {{
 *   chart: {
 *     type?: string,
 *     title?: string,
 *     items?: Array<{ label?: string, value?: number }>,
 *     segments?: Array<{ label?: string, value?: number }>,
 *   },
 * }} props
 */
export function AiMessageChart({ chart }) {
  if (!chart || typeof chart !== "object") return null;

  const items = normalizeItems(chart);
  if (items.length < 2) return null;

  const kind = String(chart.type ?? "bar").toLowerCase();
  const title = chart.title ? String(chart.title) : null;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      {title ? <p className="mb-2 text-xs font-semibold text-slate-800">{title}</p> : null}
      {kind === "donut" || kind === "pie" ? (
        <Donut items={items} />
      ) : (
        <Bars items={items} />
      )}
    </div>
  );
}

/**
 * @param {object} chart
 * @returns {Array<{ label: string, value: number }>}
 */
function normalizeItems(chart) {
  const raw = Array.isArray(chart.items)
    ? chart.items
    : Array.isArray(chart.segments)
      ? chart.segments
      : [];
  return raw
    .map((row) => ({
      label: String(row?.label ?? row?.name ?? "").trim(),
      value: Number(row?.value ?? row?.amount ?? 0),
    }))
    .filter((row) => row.label && Number.isFinite(row.value) && row.value >= 0)
    .slice(0, 8);
}

function formatKes(value) {
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `KES ${Math.round(value).toLocaleString()}`;
  }
}

function Bars({ items }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2" role="img" aria-label="Bar chart">
      {items.map((item, index) => {
        const pct = Math.max(2, (item.value / max) * 100);
        const color = CHART_COLORS[index % CHART_COLORS.length];
        return (
          <div key={`${item.label}-${index}`} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2">
            <span className="truncate text-xs text-slate-700" title={item.label}>
              {item.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="whitespace-nowrap text-[11px] font-medium text-slate-700">
              {formatKes(item.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ items }) {
  const total = items.reduce((sum, i) => sum + i.value, 0) || 1;
  const size = 132;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-28 w-28" role="img" aria-label="Donut chart">
        {items.map((item, index) => {
          const pct = item.value / total;
          const dash = pct * circumference;
          const el = (
            <circle
              key={`${item.label}-${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs text-slate-700">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="shrink-0 font-medium">{formatKes(item.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
