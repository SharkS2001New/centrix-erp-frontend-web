/**
 * Local POS held (parked) carts — IndexedDB only.
 * Does not allocate org order numbers or require the API.
 */

import {
  idbClearHeldParks,
  idbCountHeldParks,
  idbDeleteHeldPark,
  idbGetHeldPark,
  idbGetMeta,
  idbListHeldParks,
  idbPutHeldPark,
  idbSetMeta,
  newClientSaleUuid,
} from "@/lib/pos-offline-db";
import { resolvePosPaymentMethodCode } from "@/lib/pos-edit-payment-adjustment";
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

function roundMoney(value) {
  return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
}

/** Apply a held-dialog tender onto the payment snapshot fields. */
export function applyHeldTenderToPayments(payments, methodCode, amount) {
  const base = payments ?? {};
  const resolved = resolvePosPaymentMethodCode(methodCode) || "CASH";
  const method = ["MPESA", "EQUITY", "KCB", "CHEQUE", "BANK", "OTHER", "ECOBANK", "CARD"].includes(
    resolved,
  )
    ? resolved
    : "CASH";
  const paid = roundMoney(amount);

  const next = {
    payment_method_code: method,
    cash_payment_amount: 0,
    mpesa_payment_amount: 0,
    mpesa_transaction_code: base.mpesa_transaction_code ?? null,
    mpesa_phone: base.mpesa_phone ?? null,
    voucher_payment_amount: Math.max(0, Number(base.voucher_payment_amount ?? 0)) || 0,
    points_payment_amount: Math.max(0, Number(base.points_payment_amount ?? 0)) || 0,
    equity_payment_amount: 0,
    kcb_payment_amount: 0,
    cheque_payment_amount: 0,
    bank_payment_amount: 0,
    amount_paid: paid,
  };

  if (method === "MPESA") next.mpesa_payment_amount = paid;
  else if (method === "EQUITY") next.equity_payment_amount = paid;
  else if (method === "KCB") next.kcb_payment_amount = paid;
  else if (method === "CHEQUE") next.cheque_payment_amount = paid;
  else if (method === "BANK" || method === "OTHER" || method === "ECOBANK" || method === "CARD") {
    next.bank_payment_amount = paid;
  } else next.cash_payment_amount = paid;

  return next;
}

/** Sum of tender already applied on an open cart / held park. */
export function heldAmountPaid(source) {
  if (!source) return 0;
  const parts =
    Math.max(0, Number(source.cash_payment_amount ?? 0)) +
    Math.max(0, Number(source.mpesa_payment_amount ?? 0)) +
    Math.max(0, Number(source.voucher_payment_amount ?? 0)) +
    Math.max(0, Number(source.points_payment_amount ?? 0)) +
    Math.max(0, Number(source.equity_payment_amount ?? 0)) +
    Math.max(0, Number(source.kcb_payment_amount ?? 0)) +
    Math.max(0, Number(source.cheque_payment_amount ?? 0)) +
    Math.max(0, Number(source.bank_payment_amount ?? 0));
  if (parts > 0.009) return roundMoney(parts);
  const explicit = Math.max(0, Number(source.amount_paid ?? 0));
  return roundMoney(explicit);
}

export function heldBalanceDue(source, orderTotal = null) {
  const total =
    orderTotal != null && Number.isFinite(Number(orderTotal))
      ? Math.max(0, Number(orderTotal))
      : Math.max(0, Number(source?.order_total ?? 0));
  return roundMoney(Math.max(0, total - heldAmountPaid(source)));
}

function paymentSnapshotFromCart(cart) {
  return {
    payment_method_code: cart?.payment_method_code
      ? String(cart.payment_method_code).toUpperCase()
      : null,
    cash_payment_amount: Math.max(0, Number(cart?.cash_payment_amount ?? 0)) || 0,
    mpesa_payment_amount: Math.max(0, Number(cart?.mpesa_payment_amount ?? 0)) || 0,
    mpesa_transaction_code: cart?.mpesa_transaction_code ?? null,
    mpesa_phone: cart?.mpesa_phone ?? null,
    voucher_payment_amount: Math.max(0, Number(cart?.voucher_payment_amount ?? 0)) || 0,
    points_payment_amount: Math.max(0, Number(cart?.points_payment_amount ?? 0)) || 0,
    equity_payment_amount: Math.max(0, Number(cart?.equity_payment_amount ?? 0)) || 0,
    kcb_payment_amount: Math.max(0, Number(cart?.kcb_payment_amount ?? 0)) || 0,
    cheque_payment_amount: Math.max(0, Number(cart?.cheque_payment_amount ?? 0)) || 0,
    bank_payment_amount: Math.max(0, Number(cart?.bank_payment_amount ?? 0)) || 0,
  };
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
    route_id: cart?.route_id ?? null,
    till_id: cart?.till_id ?? options.tillId ?? null,
    float_session_id: cart?.float_session_id ?? options.floatSessionId ?? null,
    customer_num: customerNum,
    customer_name_override: customerName,
    order_discount: Number(cart?.order_discount ?? 0) || 0,
  };
  const summary = summarizeLocalPosCart(draftCart);
  let payments = paymentSnapshotFromCart(cart);

  const dialogTender = Number(options.heldAmountPaid);
  if (Number.isFinite(dialogTender) && dialogTender >= 0) {
    payments = applyHeldTenderToPayments(
      payments,
      options.heldPaymentMethodCode || "CASH",
      dialogTender,
    );
  }

  const amountPaid = heldAmountPaid({ ...payments, amount_paid: payments.amount_paid ?? cart?.amount_paid });
  const balanceDue = roundMoney(Math.max(0, summary.total - amountPaid));

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
    amount_paid: amountPaid,
    balance_due: balanceDue,
    ...payments,
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
      route_id: draftCart.route_id,
      till_id: draftCart.till_id,
      float_session_id: draftCart.float_session_id,
      order_discount: draftCart.order_discount,
      channel: "pos",
      ...payments,
      amount_paid: amountPaid,
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
 * After TemporaryCart materialize, keep the parked workspace prices.
 * Server replace-lines must not reprice retail/wholesale package markups.
 */
export function overlayFrozenHeldCartLines(serverCart, frozenCart) {
  const frozenLines = frozenCart?.lines ?? [];
  const serverLines = serverCart?.lines ?? [];
  if (!serverCart || !frozenLines.length || !serverLines.length) {
    return serverCart;
  }

  const remaining = frozenLines.map((line) => ({ line, used: false }));
  const lines = serverLines.map((serverLine, serverIndex) => {
    const byIndex = remaining[serverIndex];
    let match = null;
    if (
      byIndex &&
      !byIndex.used &&
      String(byIndex.line.product_code) === String(serverLine.product_code)
    ) {
      match = byIndex;
    } else {
      match = remaining.find(
        (row) =>
          !row.used &&
          String(row.line.product_code) === String(serverLine.product_code) &&
          Number(row.line.on_wholesale_retail ?? 0) ===
            Number(serverLine.on_wholesale_retail ?? 0),
      );
    }
    if (!match) return serverLine;
    match.used = true;
    const frozen = match.line;
    return {
      ...serverLine,
      quantity: frozen.quantity ?? serverLine.quantity,
      unit_price: frozen.unit_price ?? serverLine.unit_price,
      display_unit_price:
        frozen.display_unit_price != null
          ? frozen.display_unit_price
          : serverLine.display_unit_price,
      amount: frozen.amount != null ? frozen.amount : serverLine.amount,
      product_vat: frozen.product_vat != null ? frozen.product_vat : serverLine.product_vat,
      discount_given: frozen.discount_given ?? serverLine.discount_given,
      on_wholesale_retail: frozen.on_wholesale_retail ?? serverLine.on_wholesale_retail,
      uom: frozen.uom ?? serverLine.uom,
    };
  });

  return { ...serverCart, lines };
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
  const payments = paymentSnapshotFromCart({
    payment_method_code: park.payment_method_code ?? snap.payment_method_code,
    cash_payment_amount: park.cash_payment_amount ?? snap.cash_payment_amount,
    mpesa_payment_amount: park.mpesa_payment_amount ?? snap.mpesa_payment_amount,
    mpesa_transaction_code: park.mpesa_transaction_code ?? snap.mpesa_transaction_code,
    mpesa_phone: park.mpesa_phone ?? snap.mpesa_phone,
    voucher_payment_amount: park.voucher_payment_amount ?? snap.voucher_payment_amount,
    points_payment_amount: park.points_payment_amount ?? snap.points_payment_amount,
    equity_payment_amount: park.equity_payment_amount ?? snap.equity_payment_amount,
    kcb_payment_amount: park.kcb_payment_amount ?? snap.kcb_payment_amount,
    cheque_payment_amount: park.cheque_payment_amount ?? snap.cheque_payment_amount,
    bank_payment_amount: park.bank_payment_amount ?? snap.bank_payment_amount,
  });
  const amountPaid = heldAmountPaid({
    ...payments,
    amount_paid: park.amount_paid ?? snap.amount_paid,
  });

  return {
    id: "active",
    offline: false,
    channel: "pos",
    lines,
    branch_id: snap.branch_id ?? seed.branch_id ?? null,
    route_id: snap.route_id ?? seed.route_id ?? null,
    till_id: snap.till_id ?? seed.till_id ?? null,
    float_session_id: snap.float_session_id ?? seed.float_session_id ?? null,
    customer_num: park.customer_num ?? null,
    customer_name_override: park.customer_name_override ?? park.customer_name ?? "Walk-in",
    order_discount: Number(snap.order_discount ?? 0) || 0,
    ...payments,
    amount_paid: amountPaid,
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
  // Restoring consumes the park — drop it from device memory immediately.
  await idbDeleteHeldPark(id);
  return { cart, park };
}

/**
 * Ensure a held park is gone from local memory after restore (idempotent).
 * Safe to call even when restoreLocalHeldOrder already deleted the row.
 */
export async function forgetLocalHeldOrder(id) {
  if (!isLocalHeldId(id)) return false;
  return deleteLocalHeldOrder(id);
}

/** Drop every local held park (used after Z / new till session). */
export async function clearAllLocalHeldOrders() {
  await idbClearHeldParks();
  await idbSetMeta(HOLD_SEQ_META_KEY, 0);
}
