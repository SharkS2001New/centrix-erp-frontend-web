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

/** Default editable unit costs keyed by LPO line id (pack units). */
export function buildInitialLineUnitCosts(lines) {
  const initial = {};
  for (const line of lines ?? []) {
    const cost = Number(line.cost_price ?? 0);
    initial[String(line.id)] = cost > 0 ? String(cost) : "";
  }
  return initial;
}

export function resolveLineUnitCost(line, lineUnitCosts) {
  const key = String(line.id);
  const raw = lineUnitCosts?.[key];
  if (raw != null && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return Number(line.cost_price ?? 0);
}

/** Total pack qty being received in this session (all units, no offer exclusion). */
export function lpoSessionReceivedPackQty(line, uom, receiveCounts) {
  const lineKey = String(line.id);
  const receivingNow = receiveBaseForLine(lineKey, uom, receiveCounts);
  if (receivingNow <= 0) return 0;
  return packQtyFromReceiveBase(receivingNow, uom);
}

/**
 * Line total = all qty received × entered cost price.
 * The supplier invoices for the full quantity at the negotiated price.
 */
export function lpoSessionLineAmount(
  line,
  uom,
  receiveCounts,
  unitCost,
) {
  const qty = lpoSessionReceivedPackQty(line, uom, receiveCounts);
  const cost = Number(unitCost ?? line.cost_price ?? 0);
  return Math.round(qty * cost * 100) / 100;
}

/**
 * Row total for the receive table: cumulative received-to-date plus this session's qty, all at cost.
 */
export function lpoLineDisplayAmount(line, uom, receiveCounts, unitCost) {
  const sessionQty = lpoSessionReceivedPackQty(line, uom, receiveCounts);
  const receivedPack = Number(line.received_qty ?? 0);
  const cost = Number(unitCost ?? line.cost_price ?? 0);
  return Math.round((receivedPack + sessionQty) * cost * 100) / 100;
}

export function lpoSessionReceiveAmount(
  line,
  uom,
  receiveCounts,
  unitCost,
) {
  return lpoSessionLineAmount(line, uom, receiveCounts, unitCost);
}

/** @deprecated Use lpoSessionLineAmount — kept for older call sites. */
export function lpoSessionReceiveMoney(
  line,
  uom,
  receiveCounts,
  unitCostOrPrior = null,
) {
  const unitCost =
    unitCostOrPrior == null || typeof unitCostOrPrior === "object"
      ? Number(line.cost_price ?? 0)
      : Number(unitCostOrPrior);
  const lineKey = String(line.id);
  const receivingNow = receiveBaseForLine(lineKey, uom, receiveCounts);
  const qty = lpoSessionReceivedPackQty(line, uom, receiveCounts);
  const amount = lpoSessionLineAmount(line, uom, receiveCounts, unitCost);
  return {
    amount,
    unitCost,
    originalCost: Number(line.cost_price ?? 0),
    showOriginal: false,
    hasReceiving: receivingNow > 0,
    receivedToDate: qty,
  };
}

export function lpoReceiveSessionTotal(lines, uomById, receiveCounts, lineUnitCosts) {
  let total = 0;
  for (const line of lines ?? []) {
    const uom = line.unit_id ? uomById.get(line.unit_id) : null;
    const unitCost = resolveLineUnitCost(line, lineUnitCosts);
    total += lpoSessionLineAmount(line, uom, receiveCounts, unitCost);
  }
  return Math.round(total * 100) / 100;
}

