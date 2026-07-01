import { formatLpoPackQtyDisplay } from "@/components/lpo/lpo-product-utils";
import { formatQty } from "@/components/inventory/inventory-shared";
import {
  countKey,
  initStockTakeCounts,
  readStockTakeCounts,
} from "@/components/inventory/stock-take-count-inputs";
import { uomStockTakeLevels } from "@/lib/uom-packaging";
import {
  baseToDisplayQty,
  clampHierarchyCountsToMaxBase,
  displayToBaseQty,
  stockTakeCountsToBase,
} from "@/lib/stock-uom";

export function receiveBaseForLine(lineId, uom, counts) {
  const levels = uomStockTakeLevels(uom);
  const byKey = readStockTakeCounts(lineId, levels, counts);
  return stockTakeCountsToBase(byKey, uom);
}

/** UOM for manual receipt lines — prefer snapshot from add time (search results). */
export function uomForManualReceiveLine(line, uomById) {
  if (line?.unit_uom) return line.unit_uom;
  return line?.unit_id ? uomById.get(line.unit_id) ?? null : null;
}

/** Open qty on PO line in base units: ordered − already received − returns. */
export function lpoLineOpenRemainingBase(line, uom) {
  const orderedBase = displayToBaseQty(Number(line.ordered_qty ?? 0), uom);
  const receivedBase = displayToBaseQty(Number(line.received_qty ?? 0), uom);
  const returnedBase = displayToBaseQty(
    Number(line.committed_return_qty ?? line.returned_qty ?? 0),
    uom,
  );
  return Math.max(0, orderedBase - receivedBase - returnedBase);
}

export function formatLinePackQty(qty, uom) {
  if (!uom) return formatQty(qty);
  return formatLpoPackQtyDisplay(Number(qty ?? 0), uom);
}

export function buildInitialReceiveCounts(lines, uomById, baseQty = 0) {
  const initial = {};
  for (const line of lines ?? []) {
    const lineKey = String(line.id);
    const uom = line.unit_id ? uomById.get(line.unit_id) : null;
    const levels = uomStockTakeLevels(uom);
    Object.assign(initial, initStockTakeCounts(lineKey, baseQty, uom, levels));
  }
  return initial;
}

export function applyLpoReceiveCountUpdate(prev, key, value, lines, uomById) {
  const colon = key.indexOf(":");
  if (colon < 0) return prev;
  const lineIdStr = key.slice(0, colon);
  const levelKey = key.slice(colon + 1);
  const next = { ...prev, [key]: value };
  const line = (lines ?? []).find((l) => String(l.id) === lineIdStr);
  if (!line || !levelKey) return next;

  const uom = line.unit_id ? uomById.get(line.unit_id) : null;
  if (!uom) return next;

  const openRemainingBase = lpoLineOpenRemainingBase(line, uom);
  const levels = uomStockTakeLevels(uom);
  const byKey = readStockTakeCounts(lineIdStr, levels, next);
  const clamped = clampHierarchyCountsToMaxBase(byKey, levelKey, uom, openRemainingBase);
  const result = { ...next };
  for (const level of levels) {
    result[countKey(lineIdStr, level.key)] = String(clamped[level.key] ?? 0);
  }
  return result;
}

export function fillReceiveCountsForLines(lines, uomById, receiveCounts) {
  const next = { ...receiveCounts };
  for (const line of lines ?? []) {
    const lineKey = String(line.id);
    const uom = line.unit_id ? uomById.get(line.unit_id) : null;
    const levels = uomStockTakeLevels(uom);
    const openRemainingBase = lpoLineOpenRemainingBase(line, uom);
    Object.assign(next, initStockTakeCounts(lineKey, openRemainingBase, uom, levels));
  }
  return next;
}

export function packQtyFromReceiveBase(receiveBase, uom) {
  return baseToDisplayQty(receiveBase, uom);
}
