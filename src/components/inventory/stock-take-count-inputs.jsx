"use client";

import { inputClassName } from "@/components/catalog/catalog-shared";
import { uomStockTakeLevels } from "@/lib/uom-packaging";
import {
  baseToHierarchyCounts,
  clampHierarchyCountsToMaxBase,
  formatDisplayQty,
  formatMixedStockDisplay,
  stockTakeCountsToBase,
} from "@/lib/stock-uom";

export function countKey(lineId, levelKey) {
  return `${String(lineId)}:${levelKey}`;
}

export function readStockTakeCounts(lineId, levels, counts) {
  const byKey = {};
  for (const level of levels) {
    const raw = counts[countKey(lineId, level.key)];
    byKey[level.key] = raw === "" || raw == null ? 0 : Number(raw);
  }
  return byKey;
}

export function initStockTakeCounts(lineId, baseQty, uom, levels) {
  const initial = {};
  const { full, middle, small } = baseToHierarchyCounts(baseQty, uom);

  for (const level of levels) {
    const value =
      level.key === "full" ? full : level.key === "middle" ? middle : small;
    initial[countKey(lineId, level.key)] = String(value);
  }
  return initial;
}

export function StockTakeCountInputs({
  lineId,
  uom,
  counts,
  onChange,
  onPatchCounts = null,
  disabled = false,
  showPreview = true,
  maxBase = null,
  levels: levelsOverride = null,
}) {
  const levels = levelsOverride ?? uomStockTakeLevels(uom);
  const byKey = readStockTakeCounts(lineId, levels, counts);
  const baseTotal = stockTakeCountsToBase(byKey, uom);
  const preview = formatMixedStockDisplay(baseTotal, uom);
  const maxPreview =
    maxBase != null && maxBase > 0 ? formatMixedStockDisplay(maxBase, uom) : null;
  const atMax = maxBase != null && baseTotal >= maxBase - 0.0001;

  function emitChange(level, rawValue) {
    if (maxBase == null || maxBase <= 0 || rawValue === "" || rawValue == null) {
      onChange(countKey(lineId, level.key), rawValue);
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      onChange(countKey(lineId, level.key), rawValue);
      return;
    }

    const nextByKey = {
      ...byKey,
      [level.key]: parsed,
    };
    const clamped = clampHierarchyCountsToMaxBase(nextByKey, level.key, uom, maxBase);
    const patch = {};
    for (const lvl of levels) {
      patch[countKey(lineId, lvl.key)] = String(clamped[lvl.key] ?? 0);
    }

    if (typeof onPatchCounts === "function") {
      onPatchCounts(patch);
      return;
    }

    onChange(countKey(lineId, level.key), patch[countKey(lineId, level.key)]);
  }

  function handleKeyDown(level, e) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const raw = counts[countKey(lineId, level.key)];
    const current = raw === "" || raw == null ? 0 : Number(raw);
    if (!Number.isFinite(current)) return;
    const step = 1;
    const next = Math.max(0, current + (e.key === "ArrowUp" ? step : -step));
    const nextStr =
      level.key === "small" && Math.abs(next - Math.round(next)) > 0.0001
        ? String(next)
        : String(Math.round(next));
    emitChange(level, nextStr);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {levels.map((level) => (
        <label
          key={level.key}
          className="flex items-center gap-1.5 text-[10px] text-slate-500"
        >
          <span className="min-w-[52px] text-right capitalize">{level.label}</span>
          <input
            type="number"
            min="0"
            step={level.key === "small" ? "any" : "1"}
            className={`${inputClassName()} w-16 text-right`}
            value={counts[countKey(lineId, level.key)] ?? "0"}
            onChange={(e) => emitChange(level, e.target.value)}
            onInput={(e) => emitChange(level, e.target.value)}
            onKeyDown={(e) => handleKeyDown(level, e)}
            disabled={disabled}
            aria-label={`${level.label} count`}
          />
        </label>
      ))}
      {showPreview && levels.length > 1 ? (
        <span
          className={`text-[10px] ${atMax ? "text-amber-600" : "text-slate-400"}`}
          title="Total in base units"
        >
          = {preview.text}
          {maxPreview ? ` · max ${maxPreview.text}` : ""}
        </span>
      ) : null}
    </div>
  );
}

/** Read-only bags / pcs breakdown aligned with StockTakeCountInputs layout. */
export function ReadonlyHierarchyQty({ baseQty, uom, highlight = false }) {
  const levels = uomStockTakeLevels(uom);
  const { full, middle, small } = baseToHierarchyCounts(Number(baseQty ?? 0), uom);
  const byKey = { full, middle, small };
  const total = formatMixedStockDisplay(Number(baseQty ?? 0), uom);

  return (
    <div className="flex flex-col items-end gap-1">
      {levels.map((level) => (
        <div
          key={level.key}
          className={`flex items-center gap-1.5 text-[10px] ${
            highlight ? "text-[#185FA5]" : "text-slate-700"
          }`}
        >
          <span className="min-w-[52px] text-right capitalize text-slate-500">{level.label}</span>
          <span className="w-16 text-right tabular-nums font-medium">
            {formatDisplayQty(byKey[level.key])}
          </span>
        </div>
      ))}
      {levels.length > 1 ? (
        <span
          className={`text-[10px] ${highlight ? "text-[#185FA5]" : "text-slate-500"}`}
          title="Total remaining"
        >
          = {total.text}
        </span>
      ) : null}
    </div>
  );
}
