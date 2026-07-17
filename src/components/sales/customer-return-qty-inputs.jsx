"use client";

import { inputClassName } from "@/components/catalog/catalog-shared";
import { StockTakeCountInputs } from "@/components/inventory/stock-take-count-inputs";
import {
  customerReturnLineUnitLabel,
  resolveCustomerReturnLineUom,
  returnLineCountId,
  returnQtyInputLevels,
} from "@/components/sales/customer-returns-shared";
import { uomConversionFactor } from "@/lib/stock-uom";

export function CustomerReturnQtyInputs({
  line,
  uomById,
  counts,
  onCountsChange,
  onCountsPatch,
  onSimpleQtyChange,
  disabled = false,
}) {
  const uom = resolveCustomerReturnLineUom(line, uomById);
  const lineId = returnLineCountId(line);
  const levels = returnQtyInputLevels(line, uom);
  const maxBase = Number(line.max_return_qty) || 0;

  if (!uom || levels.length <= 1) {
    const unit = customerReturnLineUnitLabel(line, uomById);
    return (
      <div className="flex flex-col items-end gap-1">
        <input
          type="number"
          min="0"
          max={maxBase || undefined}
          step={uomConversionFactor(uom) > 1 && Number(line.on_wholesale_retail) !== 1 ? "1" : "any"}
          value={line.return_qty}
          onChange={(e) => onSimpleQtyChange(e.target.value)}
          disabled={disabled}
          className={`${inputClassName()} w-20 text-right text-sm disabled:bg-slate-50`}
          aria-label={`Return qty in ${unit}`}
        />
        {Number(line.return_qty) > 0 ? (
          <span className="text-[10px] text-slate-500">{unit}</span>
        ) : null}
      </div>
    );
  }

  return (
    <StockTakeCountInputs
      lineId={lineId}
      uom={uom}
      counts={counts}
      onChange={onCountsChange}
      onPatchCounts={onCountsPatch}
      disabled={disabled}
      maxBase={maxBase > 0 ? maxBase : null}
      levels={levels}
    />
  );
}
