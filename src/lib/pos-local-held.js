/**
 * Local POS held (parked) carts — IndexedDB only.
 * Does not allocate org order numbers or require the API.
 */

import {
  idbCountHeldParks,
  idbDeleteHeldPark,
  idbGetHeldPark,
  idbGetMeta,
  idbListHeldParks,
  idbPutHeldPark,
  idbSetMeta,
  newClientSaleUuid,
} from "@/lib/pos-offline-db";
import { serverCartLinesToLocal, summarizeLocalPosCart } from "@/lib/pos-offline";

const HOLD_SEQ_META_KEY = "local_held_seq";

export function isLocalHeldId(id) {
  return String(id ?? "").startsWith("local-held:");
}

export function formatLocalHoldLabel(seq) {
  const n = Number(seq);
  if (!Number.isFinite(n) || n <= 0) return "HOLD";
  return `HOLD-${n}`;
}

async function nextHoldSeq() {
  const current = Number((await idbGetMeta(HOLD_SEQ_META_KEY)) ?? 0);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  await idbSetMeta(HOLD_SEQ_META_KEY, next);
  return next;
}

function customerLabelFromParkInput({ customer = null, walkIn = false, walkInName = "" } = {}) {
  if (walkIn) return String(walkInName ?? "").trim() || "Walk-in";
  if (customer?.customer_name) return String(customer.customer_name).trim();
  return "Walk-in";
}

/**
 * Snapshot an open cart into a local held park (no server sale / order_num).
 *
 * @returns {Promise<object>} held park row (list/restore shape)
 */
export async function parkCartLocally(cart, options = {}) {
  const lines = serverCartLinesToLocal(cart?.lines);
  if (!lines.length) {
    throw new Error("Add items before holding this order.");
  }

  const holdSeq = await nextHoldSeq();
  const holdLabel = formatLocalHoldLabel(holdSeq);
  const id = `local-held:${newClientSaleUuid()}`;
  const customerName = customerLabelFromParkInput(options);
  const customerNum =
    options.walkIn || !options.customer?.customer_num
      ? null
      : Number(options.customer.customer_num);

  const draftCart = {
    id: "active",
    offline: false,
    channel: "pos",
    lines,
    branch_id: cart?.branch_id ?? options.branchId ?? null,
    till_id: cart?.till_id ?? options.tillId ?? null,
    float_session_id: cart?.float_session_id ?? options.floatSessionId ?? null,
    customer_num: customerNum,
    customer_name_override: customerName,
    order_discount: Number(cart?.order_discount ?? 0) || 0,
  };
  const summary = summarizeLocalPosCart(draftCart);

  const park = {
    id,
    local_held: true,
    status: "held",
    hold_seq: holdSeq,
    hold_label: holdLabel,
    // Intentionally no order_num — held parks must not consume the sale sequence.
    order_num: null,
    created_at_ms: Date.now(),
    created_at: new Date().toISOString(),
    cashier_id: options.cashierId ?? null,
    customer_num: customerNum,
    customer_name: customerName,
    customer: customerNum
      ? { customer_num: customerNum, customer_name: customerName }
      : null,
    customer_name_override: customerName,
    order_total: summary.total,
    total_vat: summary.vat,
    items: lines.map((line, index) => ({
      ...line,
      line_no: index + 1,
      amount:
        line.amount != null
          ? Number(line.amount)
          : Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100,
    })),
    cart_snapshot: {
      branch_id: draftCart.branch_id,
      till_id: draftCart.till_id,
      float_session_id: draftCart.float_session_id,
      order_discount: draftCart.order_discount,
      channel: "pos",
    },
  };

  await idbPutHeldPark(park);
  return park;
}

export async function listLocalHeldOrders() {
  return idbListHeldParks();
}

export async function countLocalHeldOrders() {
  return idbCountHeldParks();
}

export async function getLocalHeldOrder(id) {
  if (!isLocalHeldId(id)) return null;
  return idbGetHeldPark(id);
}

export async function deleteLocalHeldOrder(id) {
  if (!isLocalHeldId(id)) return false;
  return idbDeleteHeldPark(id);
}

/**
 * Build a workspace cart from a held park.
 * Not an "offline sale" — only the network offlineMode path locks payments to cash.
 */
export function localCartFromHeldPark(park, seed = {}) {
  if (!park?.items?.length && !park?.lines?.length) {
    throw new Error("Held order has no items.");
  }
  const lines = serverCartLinesToLocal(park.items ?? park.lines);
  if (!lines.length) {
    throw new Error("Held order has no items.");
  }
  const snap = park.cart_snapshot ?? {};
  return {
    id: "active",
    offline: false,
    channel: "pos",
    lines,
    branch_id: snap.branch_id ?? seed.branch_id ?? null,
    till_id: snap.till_id ?? seed.till_id ?? null,
    float_session_id: snap.float_session_id ?? seed.float_session_id ?? null,
    customer_num: park.customer_num ?? null,
    customer_name_override: park.customer_name_override ?? park.customer_name ?? "Walk-in",
    order_discount: Number(snap.order_discount ?? 0) || 0,
    // Restored park is a new in-progress sale — never previous-order edit.
    held_order_num: null,
    superseded_sale_id: null,
    restored_from_local_held_id: park.id,
    restored_from_hold_label: park.hold_label ?? null,
    updated_at_ms: Date.now(),
  };
}

export async function restoreLocalHeldOrder(id, seed = {}) {
  const park = await getLocalHeldOrder(id);
  if (!park) {
    throw new Error("Held order not found on this device.");
  }
  const cart = localCartFromHeldPark(park, seed);
  await idbDeleteHeldPark(id);
  return { cart, park };
}
