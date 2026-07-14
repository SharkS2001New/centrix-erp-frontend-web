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

/** Whether a PO line can still accept goods (open, partial, or offer qty over order). */
export function lpoLineCanReceive(line) {
  return (line?.receive_status ?? "open") !== "fully_returned";
}

/** Open qty on PO line in base units: ordered − already received − returns. */
export function lpoLineOpenRemainingBase(line, uom) {
  const orderedBase = displayToBaseQty(Number(line.ordered_qty ?? 0), uom);
  const receivedBase = displayToBaseQty(Number(line.received_qty ?? 0), uom);
  const offerBase = displayToBaseQty(lpoLineOfferQty(line), uom);
  const paidReceivedBase = Math.max(0, receivedBase - offerBase);
  const returnedBase = displayToBaseQty(
    Number(line.committed_return_qty ?? line.returned_qty ?? 0),
    uom,
  );
  return Math.max(0, orderedBase - paidReceivedBase - returnedBase);
}

/** Offer / bonus qty already recorded on the PO line (pack units). */
export function lpoLineOfferQty(line) {
  const stored = Number(line?.offer_qty ?? 0);
  if (stored > 0.0001) return stored;
  const received = Number(line?.received_qty ?? 0);
  const ordered = Number(line?.ordered_qty ?? 0);
  return Math.max(0, received - ordered);
}

/** Offer qty in this receive session (base units), when receiving above PO remaining. */
export function lpoSessionOfferBase(line, uom, receiveCounts, priorReceivedPack = null) {
  const lineKey = String(line.id);
  const receivingNow = receiveBaseForLine(lineKey, uom, receiveCounts);
  if (receivingNow <= 0) return 0;

  const priorReceived = priorReceivedPack ?? Number(line.received_qty ?? 0);
  const priorOffer = lpoLineOfferQty({
    ...line,
    received_qty: priorReceived,
  });
  const orderedBase = displayToBaseQty(Number(line.ordered_qty ?? 0), uom);
  const paidReceivedBase = displayToBaseQty(Math.max(0, priorReceived - priorOffer), uom);
  const roomBase = Math.max(0, orderedBase - paidReceivedBase);

  return Math.max(0, receivingNow - roomBase);
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
  return { ...prev, [key]: value };
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

/**
 * When receiving offer qty above the PO order, stock unit cost is averaged so
 * total stock value ≈ paid ordered qty × original PO cost.
 * Returns null when there is no offer in this receive batch.
 */
export function offerAdjustedUnitCost({
  originalCost,
  paidPackQty,
  receivedPackQty,
}) {
  const cost = Number(originalCost ?? 0);
  const paid = Math.max(0, Number(paidPackQty ?? 0));
  const received = Math.max(0, Number(receivedPackQty ?? 0));
  if (received <= 0.0001 || paid + 0.0001 >= received) {
    return null;
  }
  return Math.round((paid * cost) / received * 10000) / 10000;
}

/** Preview stock unit cost for the current LPO receive session (pack units). */
export function lpoSessionStockUnitCost(line, uom, receiveCounts, priorReceivedPack = null) {
  const lineKey = String(line.id);
  const receivingNow = receiveBaseForLine(lineKey, uom, receiveCounts);
  if (receivingNow <= 0) return null;

  const priorReceived = priorReceivedPack ?? Number(line.received_qty ?? 0);
  const sessionOfferBase = lpoSessionOfferBase(line, uom, receiveCounts, priorReceived);
  if (sessionOfferBase <= 0.0001) return null;

  const receivedPack = packQtyFromReceiveBase(receivingNow, uom);
  const offerPack = packQtyFromReceiveBase(sessionOfferBase, uom);
  const paidPack = Math.max(0, receivedPack - offerPack);

  return offerAdjustedUnitCost({
    originalCost: line.cost_price,
    paidPackQty: paidPack,
    receivedPackQty: receivedPack,
  });
}

