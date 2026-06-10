"use client";

import { uomStockTakeLevels } from "@/lib/uom-packaging";
import {
  countKey,
  readStockTakeCounts,
} from "@/components/inventory/stock-take-count-inputs";
import { formatMixedStockDisplay, stockTakeCountsToBase } from "@/lib/stock-uom";

const inputCls =
  "w-full rounded border border-[#b8a88a] bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-[#185FA5]";

/**
 * UOM-aware quantity entry for POS (full / middle / small counts).
 */
export function PosLineQtyInputs({
  lineId = "pos-entry",
  uom,
  orderCounts,
  onChange,
  disabled,
  inputRef,
  onEnterKey,
}) {
  const levels = uomStockTakeLevels(uom);
  const byKey = readStockTakeCounts(lineId, levels, flattenCounts(lineId, orderCounts));
  const baseTotal = stockTakeCountsToBase(byKey, uom);
  const preview = formatMixedStockDisplay(baseTotal, uom);

  function emitChange(level, rawValue) {
    onChange(level.key, rawValue);
  }

  function handleEnter(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onEnterKey?.();
  }

  if (levels.length === 1) {
    const level = levels[0];
    return (
      <div>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="any"
          className={inputCls}
          value={orderCounts?.[level.key] ?? "0"}
          onChange={(e) => emitChange(level, e.target.value)}
          onKeyDown={handleEnter}
          disabled={disabled}
          aria-label={`Quantity in ${level.label}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {levels.map((level, index) => (
        <label key={level.key} className="flex items-center gap-2 text-xs text-slate-700">
          <span className="min-w-[4.5rem] font-medium capitalize">{level.label}</span>
          <input
            ref={index === 0 ? inputRef : undefined}
            type="number"
            min="0"
            step={level.key === "small" ? "any" : "1"}
            className={`${inputCls} max-w-[6rem]`}
            value={orderCounts?.[level.key] ?? "0"}
            onChange={(e) => emitChange(level, e.target.value)}
            onKeyDown={handleEnter}
            disabled={disabled}
          />
        </label>
      ))}
      <p className="text-[10px] text-slate-500">Total: {preview.text}</p>
    </div>
  );
}

function flattenCounts(lineId, orderCounts) {
  const levels = ["full", "middle", "small"];
  const flat = {};
  for (const key of levels) {
    if (orderCounts?.[key] != null) {
      flat[countKey(lineId, key)] = orderCounts[key];
    }
  }
  return flat;
}
