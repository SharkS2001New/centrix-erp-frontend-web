"use client";

import { inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { uomStockTakeLevels } from "@/lib/uom-packaging";
import {
  defaultDamageMeasureLevel,
  damageMeasureLabel,
  inventoryAdjustmentMeasureLevels,
  normalizeDamageLevel,
  normalizeInventoryAdjustmentLevel,
} from "@/lib/stock-uom";

export function damageMeasureOptions(uom, { sellOnRetail = false } = {}) {
  if (sellOnRetail) {
    return inventoryAdjustmentMeasureLevels(uom, { sellOnRetail: true });
  }
  return uomStockTakeLevels(uom);
}

export function DamageMeasureSelect({
  uom,
  value,
  onChange,
  className,
  onClick,
  id,
  /** Sells W/R — expose retail small unit alongside wholesale pack. */
  sellOnRetail = false,
  measureLevels: measureLevelsProp = null,
  normalizeLevel: normalizeLevelProp = null,
}) {
  const measureLevels =
    measureLevelsProp ?? damageMeasureOptions(uom, { sellOnRetail });
  const normalizeLevel =
    normalizeLevelProp ??
    (sellOnRetail
      ? (packageType, uomRow) =>
          normalizeInventoryAdjustmentLevel(packageType, uomRow, { sellOnRetail: true })
      : normalizeDamageLevel);
  const normalized = normalizeLevel(value, uom);

  return (
    <div id={id} className="contents" onClick={onClick}>
      <SearchableSelect
        className={className ?? `${inputClassName()} text-xs capitalize`}
        value={normalized}
        onChange={onChange}
        options={measureLevels.map((opt) => ({ value: opt.key, label: opt.label }))}
      />
    </div>
  );
}

export function defaultDamagePackageType(uom) {
  return defaultDamageMeasureLevel(uom);
}

/** Generic aliases for receive, transfer, and other inventory forms. */
export const UomMeasureSelect = DamageMeasureSelect;
export const defaultUomMeasureLevel = defaultDamagePackageType;
export function uomMeasureLabel(uom, packageType) {
  return damageMeasureLabel(uom, packageType);
}
