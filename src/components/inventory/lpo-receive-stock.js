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
 * When paid qty < received qty (offers), stock unit cost = paid value ÷ received qty.
 * Returns null when there is no offer portion (cost equals the original PO unit cost).
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

/**
 * Billable amount for qty entered in this receive session.
 * Offer / bonus packs are free — only paid pack qty × PO cost per unit.
 */
export function lpoSessionReceiveAmount(line, uom, receiveCounts, priorReceivedPack = null) {
  return lpoSessionReceiveMoney(line, uom, receiveCounts, priorReceivedPack).amount;
}

/** Preview stock unit cost for the current LPO receive session (pack units). */
export function lpoSessionStockUnitCost(line, uom, receiveCounts, priorReceivedPack = null) {
  const money = lpoSessionReceiveMoney(line, uom, receiveCounts, priorReceivedPack);
  return money.showOriginal ? money.unitCost : null;
}

/**
 * Receive money preview that reconciles across partial receipts:
 *
 * - Total amount = this receipt only (paid packs now × original PO cost).
 * - Cost per unit = cumulative: (paid to date × original) ÷ (already received + receiving now).
 *   So late offers after a line is fully paid still dilute from Already received+current,
 *   and any sequence of partials ends at the same final cost.
 * - Original is shown only when that reconciled cost differs from the PO unit cost.
 */
export function lpoSessionReceiveMoney(line, uom, receiveCounts, priorReceivedPack = null) {
  const originalCost = Number(line.cost_price ?? 0);
  const lineKey = String(line.id);
  const receivingNow = receiveBaseForLine(lineKey, uom, receiveCounts);
  const priorReceived = priorReceivedPack ?? Number(line.received_qty ?? 0);
  const priorOffer = lpoLineOfferQty({
    ...line,
    received_qty: priorReceived,
  });
  const priorPaid = Math.max(0, priorReceived - priorOffer);

  const sessionOfferBase =
    receivingNow > 0
      ? lpoSessionOfferBase(line, uom, receiveCounts, priorReceived)
      : 0;
  const sessionReceivedPack =
    receivingNow > 0 ? packQtyFromReceiveBase(receivingNow, uom) : 0;
  const sessionOfferPack =
    sessionOfferBase > 0 ? packQtyFromReceiveBase(sessionOfferBase, uom) : 0;
  const sessionPaidPack = Math.max(0, sessionReceivedPack - sessionOfferPack);

  const amount = Math.round(sessionPaidPack * originalCost * 100) / 100;
  const paidToDate = priorPaid + sessionPaidPack;
  const receivedToDate = priorReceived + sessionReceivedPack;

  let unitCost = originalCost;
  if (receivedToDate > 0.0001) {
    const adjusted = offerAdjustedUnitCost({
      originalCost,
      paidPackQty: paidToDate,
      receivedPackQty: receivedToDate,
    });
    unitCost = adjusted ?? originalCost;
  }

  const showOriginal = Math.abs(unitCost - originalCost) > 0.00005;

  return {
    amount,
    unitCost,
    originalCost,
    showOriginal,
    hasReceiving: receivingNow > 0,
    paidToDate,
    receivedToDate,
  };
}

