"use client";

import { inputClassName } from "@/components/catalog/catalog-shared";
import { uomStockTakeLevels } from "@/lib/uom-packaging";
import { defaultDamageMeasureLevel, damageMeasureLabel, normalizeDamageLevel } from "@/lib/stock-uom";

export function damageMeasureOptions(uom) {
  return uomStockTakeLevels(uom);
}

export function DamageMeasureSelect({
  uom,
  value,
  onChange,
  className,
  onClick,
  id,
}) {
  const options = damageMeasureOptions(uom);
  const normalized = normalizeDamageLevel(value, uom);

  return (
    <select
      id={id}
      className={className ?? `${inputClassName()} text-xs capitalize`}
      value={normalized}
      onChange={(e) => onChange(e.target.value)}
      onClick={onClick}
    >
      {options.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label}
        </option>
      ))}
    </select>
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
