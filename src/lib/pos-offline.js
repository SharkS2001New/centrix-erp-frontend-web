import { apiRequest, ApiError } from "@/lib/api";
import {
  productMatchesCatalogQuery,
  stripProductStockFields,
} from "@/lib/catalog-cache";
import {
  idbAppendOrderNumbers,
  idbAppendOrderSlots,
  idbClearLocalCart,
  idbCountOrderNumbers,
  idbCountPendingOutbox,
  idbGetAllCatalog,
  idbGetCatalogProduct,
  idbGetLocalCart,
  idbGetMeta,
  idbGetOutboxSale,
  idbIsOutboxBlockingForCart,
  idbListEditableOutbox,
  idbListPendingOutbox,
  idbMarkOutboxError,
  idbMarkOutboxSynced,
  idbMarkOutboxSyncing,
  idbPutCatalogProducts,
  idbPutLocalCart,
  idbPutOutboxSale,
  idbReclaimStuckSyncingOutbox,
  idbSetMeta,
  idbTakeNextOrderSlot,
  newClientSaleUuid,
  resolveOutboxClientUuidForCart,
} from "@/lib/pos-offline-db";
import { withPosOfflineExclusiveLock } from "@/lib/pos-offline-lock";
import { snapshotUomForPrint } from "@/lib/sale-line-items";
import { submitSystemIssueReport } from "@/lib/system-issue-reports";

export const POS_OFFLINE_RESERVE_COUNT = 20;
export const POS_OFFLINE_RESERVE_LOW = 5;
/** Re-warm catalog while healthy so a brief drop (~30 min) still has recent prices. */
export const POS_OFFLINE_CATALOG_TTL_MS = 30 * 60 * 1000;
/** Design target for drop/slow bridge — not a hard cutoff. */
export const POS_OFFLINE_TARGET_OUTAGE_MS = 30 * 60 * 1000;

function sortCatalog(products, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return products;
  return [...products].sort((a, b) => {
    const ac = String(a.product_code ?? "").toLowerCase();
    const bc = String(b.product_code ?? "").toLowerCase();
    const an = String(a.product_name ?? "").toLowerCase();
    const bn = String(b.product_name ?? "").toLowerCase();
    const score = (code, name) => {
      if (code === q) return 100;
      if (code.startsWith(q)) return 80;
      if (name.startsWith(q)) return 60;
      if (code.includes(q)) return 50;
      if (name.includes(q)) return 40;
      return 0;
    };
    return score(bc, bn) - score(ac, an);
  });
}

/** Warm lean product catalog into IndexedDB for offline search. */
export async function warmPosOfflineCatalog({ force = false } = {}) {
  const last = Number((await idbGetMeta("catalog_warmed_at")) ?? 0);
  if (!force && last && Date.now() - last < POS_OFFLINE_CATALOG_TTL_MS) {
    return { skipped: true, count: (await idbGetAllCatalog()).length };
  }

  const products = [];
  let page = 1;
  let lastPage = 1;
  do {
    const res = await apiRequest("/products", {
      searchParams: {
        status: "active",
        per_page: 200,
        page,
        fields: "lean",
      },
      loading: false,
      reportIssues: false,
    });
    const rows = Array.isArray(res?.data) ? res.data : [];
    for (const row of rows) {
      const product = stripProductStockFields(row);
      if (product?.product_code) products.push(product);
    }
    lastPage = Number(res?.last_page ?? res?.meta?.last_page ?? page);
    page += 1;
  } while (page <= lastPage && page <= 50);

  await idbPutCatalogProducts(products);
  await idbSetMeta("catalog_warmed_at", Date.now());
  await idbSetMeta("catalog_count", products.length);
  return { skipped: false, count: products.length };
}

export async function searchPosOfflineCatalog(query, { limit = 50 } = {}) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return [];
  const all = await idbGetAllCatalog();
  const matched = all.filter((p) => productMatchesCatalogQuery(p, trimmed));
  return sortCatalog(matched, trimmed).slice(0, limit);
}

export async function getPosOfflineProduct(code) {
  return idbGetCatalogProduct(code);
}

export async function getPosOfflineCatalogMeta() {
  return {
    warmedAt: Number((await idbGetMeta("catalog_warmed_at")) ?? 0) || null,
    count: Number((await idbGetMeta("catalog_count")) ?? 0),
  };
}

/** Reserve sequential order numbers while online (real numbers for offline receipts). */
export async function ensurePosOfflineOrderNumbers({ force = false } = {}) {
  return withPosOfflineExclusiveLock(async () => {
    const available = await idbCountOrderNumbers();
    if (!force && available >= POS_OFFLINE_RESERVE_LOW) {
      return { reserved: 0, available };
    }
    const need = Math.max(POS_OFFLINE_RESERVE_COUNT - available, POS_OFFLINE_RESERVE_COUNT);
    const res = await apiRequest("/sales/order-numbers/reserve", {
      method: "POST",
      body: { count: Math.min(need, POS_OFFLINE_RESERVE_COUNT) },
      loading: false,
      reportIssues: false,
    });
    const numbers = Array.isArray(res?.numbers) ? res.numbers : [];
    const slots = Array.isArray(res?.slots)
      ? res.slots
      : numbers.map((order_num) => ({
          order_num: Number(order_num),
          pos_order_num: null,
          pos_order_date: null,
        }));
    if (slots.length) {
      await idbAppendOrderSlots(slots);
    } else if (numbers.length) {
      await idbAppendOrderNumbers(numbers);
    }
    return { reserved: slots.length || numbers.length, available: await idbCountOrderNumbers() };
  });
}

export async function peekPosOfflineOrderNumberCount() {
  return idbCountOrderNumbers();
}

export async function takePosOfflineOrderSlot() {
  return withPosOfflineExclusiveLock(() => idbTakeNextOrderSlot());
}

/** @deprecated use takePosOfflineOrderSlot */
export async function takePosOfflineOrderNumber() {
  const slot = await takePosOfflineOrderSlot();
  return slot ? Number(slot.order_num) : null;
}

export async function cartHasBlockingOutboxSync(cart) {
  return idbIsOutboxBlockingForCart(cart);
}

export function outboxClientUuidForCart(cart) {
  return resolveOutboxClientUuidForCart(cart);
}

export function emptyLocalPosCart(seed = {}) {
  return {
    id: "active",
    channel: "pos",
    lines: [],
    branch_id: seed.branch_id ?? null,
    till_id: seed.till_id ?? null,
    float_session_id: seed.float_session_id ?? null,
    customer_num: seed.customer_num ?? null,
    customer_name_override: seed.customer_name_override ?? null,
    updated_at_ms: Date.now(),
    offline: true,
  };
}

export async function loadOrCreateLocalPosCart(seed = {}) {
  const existing = await idbGetLocalCart("active");
  if (existing) return existing;
  const cart = emptyLocalPosCart(seed);
  await idbPutLocalCart(cart);
  return cart;
}

export async function saveLocalPosCart(cart) {
  const next = { ...cart, id: "active", updated_at_ms: Date.now(), offline: true };
  await idbPutLocalCart(next);
  return next;
}

const PREVIOUS_ORDER_EDIT_DRAFT_ID = "previous_order_edit";

/**
 * Persist an online previous-order edit draft locally (does not mark the cart offline).
 * Edits stay fast; F10/checkout flushes to the server cart in one shot.
 */
export async function savePreviousOrderEditDraft(cart) {
  if (!cart?.held_order_num || !cart?.superseded_sale_id) return null;
  if (cart.offline || cart.offline_client_sale_uuid) return null;

  const serverCartId = isServerPosCartId(cart.id)
    ? Number(cart.id)
    : isServerPosCartId(cart.server_cart_id)
      ? Number(cart.server_cart_id)
      : null;

  const lines = (cart.lines ?? [])
    .map((line) => {
      const qty = Number(line.quantity ?? 0);
      if (!line?.product_code || !(qty > 0)) return null;
      return {
        client_line_id: String(
          line.client_line_id ?? line.update_code ?? line.id ?? newClientSaleUuid(),
        ),
        id: line.id,
        update_code: line.update_code ?? line.id,
        product_code: line.product_code,
        product_name: line.product_name ?? line.description ?? line.product_code,
        quantity: qty,
        unit_price: Number(line.unit_price ?? line.price ?? 0),
        display_unit_price:
          line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
        amount: line.amount != null ? Number(line.amount) : undefined,
        uom: line.uom ?? null,
        on_wholesale_retail: Boolean(Number(line.on_wholesale_retail ?? 0)),
        discount_given: Number(line.discount_given ?? 0),
        product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
        vat_rate: Number(line.vat_rate ?? line.tax_rate ?? 0),
        _draftEdit: true,
      };
    })
    .filter(Boolean);

  const draft = {
    id: PREVIOUS_ORDER_EDIT_DRAFT_ID,
    previous_order_edit: true,
    offline: false,
    server_cart_id: serverCartId,
    held_order_num: cart.held_order_num,
    superseded_sale_id: cart.superseded_sale_id ?? null,
    pos_order_num: cart.pos_order_num ?? null,
    pos_order_date: cart.pos_order_date ?? null,
    order_discount: Number(cart.order_discount ?? 0) || 0,
    update_no: cart.update_no ?? null,
    branch_id: cart.branch_id ?? null,
    till_id: cart.till_id ?? null,
    customer_num: cart.customer_num ?? null,
    customer_name_override: cart.customer_name_override ?? null,
    lines,
    _editDraftDirty: Boolean(cart._editDraftDirty),
    updated_at_ms: Date.now(),
  };
  await idbPutLocalCart(draft);
  return draft;
}

export async function loadPreviousOrderEditDraft() {
  const draft = await idbGetLocalCart(PREVIOUS_ORDER_EDIT_DRAFT_ID);
  if (!draft?.previous_order_edit || !draft?.held_order_num) return null;
  return draft;
}

export async function clearPreviousOrderEditDraft() {
  await idbClearLocalCart(PREVIOUS_ORDER_EDIT_DRAFT_ID);
}

export function isServerPosCartId(id) {
  return id != null && String(id) !== "active" && /^\d+$/.test(String(id));
}

/** True when an API error means the TemporaryCart was already checked out / deleted. */
export function isMissingTemporaryCartError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (/temporarycart|cart not found|already been checked out/.test(msg)) return true;
  if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
    const blob = JSON.stringify(err.body ?? {}).toLowerCase();
    return /temporarycart|cart not found|no query results/.test(msg) || /temporarycart|cart/.test(blob);
  }
  return false;
}

/**
 * Detach the live edit session from a server TemporaryCart id so checkout can
 * delete that cart without the UI keeping a dead id.
 */
export function detachPreviousOrderEditCartId(cart) {
  if (!cart?.held_order_num) return cart;
  if (!isServerPosCartId(cart.id)) return cart;
  return {
    ...cart,
    id: `edit:${Number(cart.held_order_num)}`,
    server_cart_id: null,
  };
}

export async function clearLocalPosCart() {
  await idbClearLocalCart("active");
}

/** Normalize server (or mixed) cart lines into local offline line shape. */
export function serverCartLinesToLocal(lines) {
  return (lines ?? [])
    .map((line) => {
      const qty = Number(line.quantity ?? 0);
      if (!line?.product_code || !(qty > 0)) return null;
      return {
        client_line_id: String(
          line.client_line_id ?? line.update_code ?? line.id ?? newClientSaleUuid(),
        ),
        product_code: line.product_code,
        product_name: line.product_name ?? line.description ?? line.product_code,
        quantity: qty,
        unit_price: Number(line.unit_price ?? line.price ?? 0),
        display_unit_price:
          line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
        uom: line.uom ?? null,
        unit_id: line.unit_id ?? line.product?.unit_id ?? line.product?.unit?.id ?? null,
        unit:
          snapshotUomForPrint(line.unit) ??
          snapshotUomForPrint(line.product?.unit ?? line.product?.uom),
        on_wholesale_retail: Boolean(Number(line.on_wholesale_retail ?? 0)),
        discount_given: Number(line.discount_given ?? 0),
        vat_rate: Number(line.vat_rate ?? line.tax_rate ?? line.product_vat ?? 0),
      };
    })
    .filter(Boolean);
}

/**
 * When the link drops mid-sale, copy the open online cart into IndexedDB so lines
 * are not wiped the next time offline cart helpers run.
 */
export async function adoptOnlineCartForOffline(onlineCart, seed = {}) {
  if (onlineCart?.offline && Array.isArray(onlineCart.lines)) {
    const saved = await saveLocalPosCart(onlineCart);
    return saved;
  }

  const lines = serverCartLinesToLocal(onlineCart?.lines);
  const local = {
    id: "active",
    offline: true,
    channel: "pos",
    lines,
    branch_id: onlineCart?.branch_id ?? seed.branch_id ?? null,
    till_id: onlineCart?.till_id ?? seed.till_id ?? null,
    float_session_id: onlineCart?.float_session_id ?? seed.float_session_id ?? null,
    customer_num: onlineCart?.customer_num ?? null,
    customer_name_override: onlineCart?.customer_name_override ?? null,
    held_order_num: onlineCart?.held_order_num ?? null,
    offline_client_sale_uuid: onlineCart?.offline_client_sale_uuid ?? null,
    offline_edit_snapshot: onlineCart?.offline_edit_snapshot ?? null,
    migrated_from_online_cart_id: onlineCart?.id ?? null,
    updated_at_ms: Date.now(),
  };
  await idbPutLocalCart(local);
  return local;
}

function lineKey(line) {
  return `${line.product_code}|${line.uom ?? ""}|${line.on_wholesale_retail ? 1 : 0}`;
}

export async function upsertLocalPosCartLine(cart, line) {
  const lines = [...(cart.lines ?? [])];
  const key = lineKey(line);
  const idx = lines.findIndex((l) => lineKey(l) === key);
  if (idx >= 0) {
    lines[idx] = {
      ...lines[idx],
      ...line,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
    };
  } else {
    lines.push({
      ...line,
      client_line_id: line.client_line_id ?? newClientSaleUuid(),
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
    });
  }
  return saveLocalPosCart({ ...cart, lines });
}

export async function removeLocalPosCartLine(cart, clientLineId) {
  const lines = (cart.lines ?? []).filter((l) => l.client_line_id !== clientLineId);
  return saveLocalPosCart({ ...cart, lines });
}

export function summarizeLocalPosCart(cart) {
  const lines = cart?.lines ?? [];
  let total = 0;
  let vat = 0;
  for (const line of lines) {
    const qty = Number(line.quantity ?? 0);
    const price = Number(line.unit_price ?? 0);
    const amount =
      line.amount != null && Number.isFinite(Number(line.amount))
        ? Math.round(Number(line.amount) * 100) / 100
        : Math.round(qty * price * 100) / 100;
    total += amount;
    const rate = Number(line.vat_rate ?? line.tax_rate ?? 0);
    if (rate > 0) {
      vat += Math.round(((amount * rate) / (100 + rate)) * 100) / 100;
    }
  }
  total = Math.round(total * 100) / 100;
  vat = Math.round(vat * 100) / 100;
  return {
    total,
    vat,
    amountDue: total,
    lineCount: lines.length,
  };
}

/**
 * Complete a local cash sale: reserved order # (or reuse for edits), queue outbox, clear cart.
 * Supports:
 * - new sale (takes reserved order #)
 * - revising a pending offline sale (same client uuid + order #)
 * - previous-order edit (reuse held order #; sync updates the server record)
 *
 * @param {{ keepCart?: boolean, skipClearDraft?: boolean }} [options]
 *   When keepCart is true (live previous-order edit session), do not clear the
 *   workspace cart/draft so the cashier can keep editing.
 * @returns {Promise<{ sale: object, outbox: object }>}
 */
export async function completeOfflineCashSale({
  cart,
  user,
  organization,
  cashAmount,
  floatSessionId,
  keepCart = false,
  skipClearDraft = false,
}) {
  const summary = summarizeLocalPosCart(cart);
  if (!summary.lineCount) {
    throw new Error("Cart is empty.");
  }

  const editingUuid =
    cart.offline_client_sale_uuid != null && String(cart.offline_client_sale_uuid).trim()
      ? String(cart.offline_client_sale_uuid).trim()
      : null;
  const reuseOrderNum =
    cart.held_order_num != null && Number(cart.held_order_num) > 0
      ? Number(cart.held_order_num)
      : null;
  const supersededSaleId =
    cart.superseded_sale_id != null && Number(cart.superseded_sale_id) > 0
      ? Number(cart.superseded_sale_id)
      : null;
  const serverCartId = isServerPosCartId(cart.id) ? Number(cart.id) : null;
  const isPreviousOrderEdit = Boolean(reuseOrderNum && (supersededSaleId || serverCartId));

  let orderNum = reuseOrderNum;
  let clientSaleUuid = editingUuid;
  let syncKind = "sale";
  let posOrderNum = null;
  let posOrderDate = null;

  if (editingUuid && reuseOrderNum) {
    // Revising a queued offline sale — keep printed order # and outbox identity.
    orderNum = reuseOrderNum;
    clientSaleUuid = editingUuid;
  } else if (isPreviousOrderEdit) {
    // Previous-order edit — stable uuid per order # so repeated edits upsert one row.
    syncKind = "previous_order_edit";
    orderNum = reuseOrderNum;
    clientSaleUuid = editingUuid || `prev-edit-${orderNum}`;
  } else if (editingUuid || reuseOrderNum) {
    throw new Error("Offline edit is missing its original order number. Cancel and reopen the sale.");
  } else {
    const slot = await takePosOfflineOrderSlot();
    if (!slot?.order_num) {
      throw new Error(
        "No reserved order numbers left for offline selling. Reconnect briefly to reserve more.",
      );
    }
    orderNum = Number(slot.order_num);
    posOrderNum = slot.pos_order_num != null ? Number(slot.pos_order_num) : null;
    posOrderDate = slot.pos_order_date ?? null;
    clientSaleUuid = newClientSaleUuid();
    syncKind = "sale";
  }

  const payNow = Math.max(Number(cashAmount ?? summary.amountDue), summary.amountDue);
  const nowIso = new Date().toISOString();
  const existingOutbox = clientSaleUuid ? await idbGetOutboxSale(clientSaleUuid) : null;
  if (existingOutbox?.sync_kind === "previous_order_edit") {
    syncKind = "previous_order_edit";
  }
  if (existingOutbox?.sale_payload?.pos_order_num != null) {
    posOrderNum = Number(existingOutbox.sale_payload.pos_order_num);
    posOrderDate = existingOutbox.sale_payload.pos_order_date ?? posOrderDate;
  } else if (cart.pos_order_num != null && Number(cart.pos_order_num) > 0) {
    posOrderNum = Number(cart.pos_order_num);
    posOrderDate = cart.pos_order_date ?? posOrderDate;
  }
  const createdAtIso =
    existingOutbox?.sale_payload?.created_at ??
    existingOutbox?.sale_payload?.completed_at ??
    nowIso;

  const saleItems = [];
  for (const [index, line] of (cart.lines ?? []).entries()) {
    const catalog = line.product_code
      ? await idbGetCatalogProduct(line.product_code)
      : null;
    const unit =
      snapshotUomForPrint(line.unit) ??
      snapshotUomForPrint(catalog?.uom ?? catalog?.unit) ??
      null;
    const unitId = line.unit_id ?? catalog?.unit_id ?? unit?.id ?? null;
    const lineAmount =
      line.amount != null && Number.isFinite(Number(line.amount))
        ? Math.round(Number(line.amount) * 100) / 100
        : Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100;
    saleItems.push({
      id: index + 1,
      product_code: line.product_code,
      product_name:
        line.product_name ??
        catalog?.product_name ??
        line.description ??
        line.product_code,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      amount: lineAmount,
      uom: line.uom ?? null,
      unit_id: unitId,
      unit,
      on_wholesale_retail: Boolean(line.on_wholesale_retail),
      discount_given: Number(line.discount_given ?? 0),
      vat_rate: Number(line.vat_rate ?? line.tax_rate ?? catalog?.vat_rate ?? catalog?.vat?.vat_percentage ?? 0),
      product_vat: (() => {
        const rate = Number(line.vat_rate ?? line.tax_rate ?? catalog?.vat_rate ?? catalog?.vat?.vat_percentage ?? 0);
        if (rate <= 0) return 0;
        return Math.round(((lineAmount * rate) / (100 + rate)) * 100) / 100;
      })(),
      product: {
        product_code: line.product_code,
        product_name:
          line.product_name ?? catalog?.product_name ?? line.product_code,
        unit_id: unitId,
        unit,
        vat_rate: Number(line.vat_rate ?? line.tax_rate ?? catalog?.vat_rate ?? catalog?.vat?.vat_percentage ?? 0),
        vat: catalog?.vat ?? null,
      },
    });
  }

  const sale = {
    id: `offline:${clientSaleUuid}`,
    client_sale_uuid: clientSaleUuid,
    order_num: orderNum,
    ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
    ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
    organization_id: organization?.id ?? user?.organization_id ?? null,
    branch_id: cart.branch_id ?? user?.branch_id ?? null,
    till_id: cart.till_id ?? null,
    float_session_id: floatSessionId ?? cart.float_session_id ?? null,
    cashier_id: user?.id ?? null,
    created_by: user?.id ?? null,
    channel: "pos",
    order_source: "pos",
    status: "completed",
    payment_status: "paid",
    payment_method_code: "CASH",
    is_credit_sale: false,
    order_total: summary.total,
    total_vat: summary.vat,
    amount_paid: payNow,
    cash: payNow,
    completed_at: nowIso,
    created_at: createdAtIso,
    customer_num: cart.customer_num ?? null,
    customer_name_override: cart.customer_name_override ?? null,
    offline_pending_sync: true,
    superseded_sale_id: supersededSaleId,
    items: saleItems,
    payments: [
      {
        id: 1,
        payment_method_code: "CASH",
        amount: payNow,
        payment_method: { code: "CASH", name: "Cash" },
      },
    ],
  };

  const wasSyncing = existingOutbox?.sync_status === "syncing";
  const contentRevision = Number(existingOutbox?.content_revision ?? 0) + 1;
  const outbox = {
    client_sale_uuid: clientSaleUuid,
    order_num: orderNum,
    // Keep syncing if mid-flight so we don't double-claim; revision bump re-queues after.
    sync_status: wasSyncing ? "syncing" : "pending",
    sync_started_at_ms: wasSyncing ? existingOutbox.sync_started_at_ms : null,
    revision_at_sync: wasSyncing ? existingOutbox.revision_at_sync : null,
    content_revision: contentRevision,
    sync_kind: syncKind,
    server_cart_id: (() => {
      // Previous-order sync checkouts delete the TemporaryCart. Never reuse a stale
      // outbox cart id — restore-to-cart when the live UI no longer has a server id.
      if (syncKind === "previous_order_edit") {
        return serverCartId;
      }
      return serverCartId ?? existingOutbox?.server_cart_id ?? null;
    })(),
    superseded_sale_id: (() => {
      if (existingOutbox?.sync_kind === "previous_order_edit" && existingOutbox.server_sale_id) {
        return Number(
          existingOutbox.superseded_sale_id ?? existingOutbox.server_sale_id,
        );
      }
      return supersededSaleId ?? existingOutbox?.superseded_sale_id ?? null;
    })(),
    order_discount: Number(cart.order_discount ?? 0) || 0,
    created_at_ms: existingOutbox?.created_at_ms ?? Date.now(),
    updated_at_ms: Date.now(),
    sale_payload: sale,
    checkout_body: {
      order_num: orderNum,
      ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
      ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
      payment_method_code: "CASH",
      pay_now: payNow,
      is_credit_sale: false,
      submit_kra: false,
      offline_order: true,
      client_sale_uuid: clientSaleUuid,
      // Revision only for previous-order edits — new sales keep a stable uuid key for retry dedupe.
      ...(syncKind === "previous_order_edit" ? { content_revision: contentRevision } : {}),
      float_session_id: sale.float_session_id,
      customer_num: sale.customer_num,
      customer_name_override: sale.customer_name_override,
      total_vat: sale.total_vat,
      sales_workspace: "pos",
    },
    cart_seed: {
      branch_id: sale.branch_id,
      till_id: sale.till_id,
      float_session_id: sale.float_session_id,
      channel: "pos",
    },
    lines: sale.items.map((item) => ({
      product_code: item.product_code,
      quantity: item.quantity,
      unit_price: item.unit_price,
      uom: item.uom,
      on_wholesale_retail: item.on_wholesale_retail,
      discount_given: item.discount_given,
      product_name: item.product_name,
      display_unit_price: item.display_unit_price,
      product_vat: item.product_vat,
      amount: item.amount,
    })),
  };

  await idbPutOutboxSale(outbox);
  if (!keepCart) {
    await clearLocalPosCart();
  }
  if (!skipClearDraft && !keepCart) {
    await clearPreviousOrderEditDraft().catch(() => {});
  }
  return { sale, outbox };
}

/**
 * Upsert a previous-order edit into the outbox without clearing the live cart.
 * Used for instant save + background sync while the cashier keeps editing.
 */
export async function upsertPreviousOrderEditOutbox({
  cart,
  user,
  organization,
  floatSessionId,
  cashAmount,
}) {
  if (!cart?.held_order_num || !cart?.superseded_sale_id) {
    throw new Error("Not a previous-order edit session.");
  }
  return completeOfflineCashSale({
    cart,
    user,
    organization,
    cashAmount,
    floatSessionId,
    keepCart: true,
    skipClearDraft: true,
  });
}

/**
 * Build a printable sale snapshot from the current previous-order edit cart
 * (no outbox write). Used by Alt+P while revising.
 */
export function buildPreviousOrderEditPrintSale(cart, { user = null, organization = null } = {}) {
  if (!cart?.held_order_num) return null;
  const summary = summarizeLocalPosCart(cart);
  const orderNum = Number(cart.held_order_num);
  const payNow = summary.amountDue;
  const items = (cart.lines ?? [])
    .filter((line) => Number(line.quantity ?? 0) > 0 && line.product_code)
    .map((line, index) => {
      const lineAmount =
        line.amount != null && Number.isFinite(Number(line.amount))
          ? Math.round(Number(line.amount) * 100) / 100
          : Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100;
      return {
        id: line.id ?? index + 1,
        product_code: line.product_code,
        product_name: line.product_name ?? line.description ?? line.product_code,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price ?? 0),
        amount: lineAmount,
        uom: line.uom ?? null,
        unit: snapshotUomForPrint(line.unit),
        unit_id: line.unit_id ?? null,
        on_wholesale_retail: Boolean(line.on_wholesale_retail),
        discount_given: Number(line.discount_given ?? 0),
        product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
        product: {
          product_code: line.product_code,
          product_name: line.product_name ?? line.product_code,
          unit: snapshotUomForPrint(line.unit),
          unit_id: line.unit_id ?? null,
        },
      };
    });
  if (!items.length) return null;
  return {
    id: cart.server_sale_id ?? `edit:${orderNum}`,
    order_num: orderNum,
    ...(cart.pos_order_num != null ? { pos_order_num: Number(cart.pos_order_num) } : {}),
    ...(cart.pos_order_date ? { pos_order_date: cart.pos_order_date } : {}),
    organization_id: organization?.id ?? user?.organization_id ?? null,
    branch_id: cart.branch_id ?? user?.branch_id ?? null,
    channel: "pos",
    order_source: "pos",
    status: "completed",
    payment_status: "paid",
    payment_method_code: "CASH",
    order_total: summary.total,
    total_vat: summary.vat,
    amount_paid: payNow,
    cash: payNow,
    customer_num: cart.customer_num ?? null,
    customer_name_override: cart.customer_name_override ?? null,
    superseded_sale_id: cart.superseded_sale_id ?? null,
    items,
    payments: [
      {
        id: 1,
        payment_method_code: "CASH",
        amount: payNow,
        payment_method: { code: "CASH", name: "Cash" },
      },
    ],
  };
}

function mapOutboxLinesForPut(row) {
  return (row.lines ?? []).map((line) => {
    const qty = Math.max(0.0001, Number(line.quantity) || 0);
    const unitPrice = Number(line.unit_price ?? 0);
    return {
      product_code: line.product_code,
      quantity: qty,
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
      display_unit_price:
        line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
      uom: line.uom ?? undefined,
      on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) ? 1 : 0,
      discount_given: Number(line.discount_given ?? 0) || 0,
      product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
      amount: line.amount != null ? Number(line.amount) : undefined,
    };
  });
}

/**
 * Sync a previous-order edit: PUT lines onto the edit cart (or restore-to-cart), then checkout
 * with the same order number so the server record is updated.
 */
async function resolvePreviousOrderEditCartId(row) {
  let cartId = row.server_cart_id ? Number(row.server_cart_id) : null;
  const supersededId = Number(row.superseded_sale_id ?? row.server_sale_id ?? 0) || null;

  async function restoreFromSupersededSale() {
    if (!supersededId) return null;
    const restored = await apiRequest(`/sales/orders/${supersededId}/restore-to-cart`, {
      method: "POST",
      body: { replace: true },
      loading: false,
      reportIssues: false,
    });
    return restored?.id ? Number(restored.id) : null;
  }

  if (cartId) {
    try {
      await apiRequest(`/sales/carts/${cartId}`, { loading: false, reportIssues: false });
      return cartId;
    } catch (err) {
      if (!isMissingTemporaryCartError(err)) {
        // Ownership/branch errors should surface; missing cart falls through to restore.
        const status = err instanceof ApiError ? err.status : null;
        if (status && status !== 404 && status !== 410) throw err;
      }
      cartId = null;
    }
  }

  return restoreFromSupersededSale();
}

async function checkoutBodyForOutboxRow(row, orderNum, extras = {}) {
  return {
    ...row.checkout_body,
    order_num: orderNum,
    offline_order: true,
    client_sale_uuid: row.client_sale_uuid,
    ...(row.sync_kind === "previous_order_edit" && row.content_revision != null
      ? { content_revision: Number(row.content_revision) }
      : {}),
    ...(extras.pos_order_num != null ? { pos_order_num: Number(extras.pos_order_num) } : {}),
    ...(extras.pos_order_date ? { pos_order_date: extras.pos_order_date } : {}),
  };
}

async function checkoutPreviousOrderEditOutboxRow(row, orderNum) {
  let cartId = await resolvePreviousOrderEditCartId(row);

  if (!cartId) {
    throw new Error("Missing edit cart for previous order sync.");
  }

  async function putLines(targetCartId) {
    await apiRequest(`/sales/carts/${targetCartId}/lines`, {
      method: "PUT",
      body: {
        lines: mapOutboxLinesForPut(row),
        order_discount: Number(row.order_discount ?? 0) || 0,
      },
      loading: false,
      reportIssues: false,
    });
  }

  try {
    await putLines(cartId);
  } catch (putErr) {
    // Stale cart id after a prior checkout — restore the sale and retry once.
    if (!isMissingTemporaryCartError(putErr) && !(putErr instanceof ApiError && putErr.status === 404)) {
      throw putErr;
    }
    const retryCartId = await resolvePreviousOrderEditCartId({
      ...row,
      server_cart_id: null,
    });
    if (!retryCartId) throw putErr;
    cartId = retryCartId;
    await putLines(cartId);
  }

  try {
    return await apiRequest(`/sales/carts/${cartId}/checkout`, {
      method: "POST",
      body: await checkoutBodyForOutboxRow(row, orderNum),
      loading: false,
      reportIssues: false,
    });
  } catch (checkoutErr) {
    // Cart vanished between PUT and checkout (concurrent sync) — restore and retry once.
    if (!isMissingTemporaryCartError(checkoutErr)) throw checkoutErr;
    const retryCartId = await resolvePreviousOrderEditCartId({
      ...row,
      server_cart_id: null,
    });
    if (!retryCartId) throw checkoutErr;
    await putLines(retryCartId);
    return apiRequest(`/sales/carts/${retryCartId}/checkout`, {
      method: "POST",
      body: await checkoutBodyForOutboxRow(row, orderNum),
      loading: false,
      reportIssues: false,
    });
  }
}

async function checkoutOutboxRow(row, orderNum, extras = {}) {
  if (row.sync_kind === "previous_order_edit") {
    return checkoutPreviousOrderEditOutboxRow(row, orderNum);
  }

  const cart = await apiRequest("/sales/carts", {
    method: "POST",
    body: {
      channel: "pos",
      branch_id: row.cart_seed?.branch_id ?? undefined,
      till_id: row.cart_seed?.till_id ?? undefined,
    },
    loading: false,
    reportIssues: false,
  });
  const cartId = cart?.id;
  if (!cartId) throw new Error("Could not create sync cart.");

  for (const line of row.lines ?? []) {
    await apiRequest(`/sales/carts/${cartId}/lines`, {
      method: "POST",
      body: {
        product_code: line.product_code,
        quantity: line.quantity,
        unit_price: line.unit_price,
        uom: line.uom,
        on_wholesale_retail: line.on_wholesale_retail,
        discount_given: line.discount_given ?? 0,
      },
      loading: false,
      reportIssues: false,
    });
  }

  return apiRequest(`/sales/carts/${cartId}/checkout`, {
    method: "POST",
    body: await checkoutBodyForOutboxRow(row, orderNum, extras),
    loading: false,
    reportIssues: false,
  });
}

export function parseOfflineSaleUuid(saleId) {
  const raw = String(saleId ?? "");
  if (raw.startsWith("offline:")) return raw.slice("offline:".length);
  return raw || null;
}

/** Pending offline sales that can be reopened for edit (newest first). */
export async function listOfflinePendingSalesForEdit() {
  const pending = await idbListEditableOutbox();
  return pending
    .map((row) => {
      const sale = row.sale_payload && typeof row.sale_payload === "object" ? row.sale_payload : {};
      return {
        ...sale,
        id: `offline:${row.client_sale_uuid}`,
        order_num: row.order_num,
        status: sale.status ?? "completed",
        offline_pending_sync: true,
      };
    })
    .sort((a, b) => Number(b.order_num ?? 0) - Number(a.order_num ?? 0));
}

/**
 * Load a pending offline sale into the local cart for edit (same order #).
 * Marks the outbox row as `editing` so sync will not replay it mid-edit.
 */
export async function beginOfflineSaleEdit(saleId, { seed = {} } = {}) {
  const uuid = parseOfflineSaleUuid(saleId);
  if (!uuid) throw new Error("Invalid offline sale.");
  const row = await idbGetOutboxSale(uuid);
  if (!row) {
    throw new Error("That offline sale is no longer in the local queue.");
  }
  if (row.sync_status === "synced") {
    throw new Error("That sale already synced. Reopen it with its server order number.");
  }

  const sale = row.sale_payload ?? {};
  const lines = (row.lines?.length ? row.lines : sale.items ?? []).map((line) => {
    const clientLineId = line.client_line_id ?? newClientSaleUuid();
    return {
      ...line,
      client_line_id: clientLineId,
      product_code: line.product_code,
      product_name: line.product_name ?? line.description ?? line.product_code,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      uom: line.uom ?? null,
      on_wholesale_retail: Boolean(line.on_wholesale_retail),
      discount_given: Number(line.discount_given ?? 0),
    };
  });

  const localCart = {
    id: "active",
    offline: true,
    channel: "pos",
    held_order_num: Number(row.order_num),
    superseded_sale_id:
      row.sync_kind === "previous_order_edit"
        ? Number(row.superseded_sale_id ?? row.server_sale_id ?? 0) || null
        : null,
    offline_client_sale_uuid: row.client_sale_uuid,
    offline_edit_snapshot: row,
    branch_id: row.cart_seed?.branch_id ?? sale.branch_id ?? seed.branch_id ?? null,
    till_id: row.cart_seed?.till_id ?? sale.till_id ?? seed.till_id ?? null,
    float_session_id:
      row.cart_seed?.float_session_id ?? sale.float_session_id ?? seed.float_session_id ?? null,
    customer_num: sale.customer_num ?? null,
    customer_name_override: sale.customer_name_override ?? null,
    lines,
    updated_at_ms: Date.now(),
  };

  await idbPutOutboxSale({ ...row, sync_status: "editing" });
  await idbPutLocalCart(localCart);
  return { cart: localCart, sale: { ...sale, id: `offline:${uuid}`, order_num: row.order_num } };
}

/** Put a mid-edit offline sale back on the sync queue without applying cart changes. */
export async function abandonOfflineSaleEdit(cart) {
  const snapshot = cart?.offline_edit_snapshot;
  if (snapshot?.client_sale_uuid) {
    await idbPutOutboxSale({
      ...snapshot,
      sync_status: "pending",
    });
  } else if (cart?.offline_client_sale_uuid) {
    const existing = await idbGetOutboxSale(cart.offline_client_sale_uuid);
    if (existing) {
      await idbPutOutboxSale({ ...existing, sync_status: "pending" });
    }
  }
  await clearLocalPosCart();
}

export async function getPosOfflinePendingCount() {
  return idbCountPendingOutbox();
}

function isDuplicateOrderNumError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (/order[_\s-]?num|duplicate|unique|already exists|1062/.test(msg)) {
    return true;
  }
  if (err instanceof ApiError) {
    const body = err.body;
    const blob = JSON.stringify(body ?? {}).toLowerCase();
    if (/order_num|duplicate|unique|1062/.test(blob)) return true;
    if (err.status === 422 || err.status === 409) {
      return /order/.test(msg) || /order/.test(blob);
    }
  }
  return false;
}

/** Prefer consuming a locally reserved slot; otherwise reserve one now. */
async function allocateFreshOrderSlotForSync() {
  const local = await idbTakeNextOrderSlot();
  if (local?.order_num) return local;
  const res = await apiRequest("/sales/order-numbers/reserve", {
    method: "POST",
    body: { count: 1 },
    loading: false,
    reportIssues: false,
  });
  const slots = Array.isArray(res?.slots) ? res.slots : null;
  if (slots?.length) {
    // Consume the first reserved slot immediately; leave extras if any.
    const [first, ...rest] = slots;
    if (rest.length) await idbAppendOrderSlots(rest);
    return first;
  }
  const n = Array.isArray(res?.numbers) ? res.numbers[0] : res?.start;
  if (!n) throw new Error("Could not allocate a replacement order number.");
  return { order_num: Number(n), pos_order_num: null, pos_order_date: null };
}

/** If this offline sale already synced (duplicate order #), recover the server row. */
async function tryRecoverExistingOfflineSale(row, orderNum) {
  const clientUuid = row.client_sale_uuid;
  if (!clientUuid) return null;
  const expectedSyncId =
    row.sync_kind === "previous_order_edit" && row.content_revision != null
      ? `${clientUuid}:${Number(row.content_revision)}`
      : clientUuid;
  try {
    const res = await apiRequest("/sales", {
      searchParams: {
        q: String(orderNum),
        per_page: 25,
        channel: "pos",
        order_source: "pos",
      },
      loading: false,
      reportIssues: false,
    });
    const rows = Array.isArray(res?.data) ? res.data : [];
    const match = rows.find((sale) => {
      if (Number(sale.order_num) !== Number(orderNum)) return false;
      const meta = sale.fulfillment_meta ?? {};
      if (meta.pos_sync_id && String(meta.pos_sync_id) === String(expectedSyncId)) {
        return true;
      }
      const uuid =
        meta.client_sale_uuid ??
        meta.offline_client_sale_uuid ??
        sale.client_sale_uuid;
      if (uuid && String(uuid) === String(clientUuid)) return true;
      return false;
    });
    return match?.id ? match : null;
  } catch {
    return null;
  }
}

function reportPosOutboxSyncFailure(row, err, printedOrderNum) {
  const message = err?.message ?? "Sync failed";
  const httpStatus = err instanceof ApiError ? err.status : null;
  void submitSystemIssueReport({
    kind: "error",
    message: `POS outbox sync failed for order #${printedOrderNum}: ${message}`,
    api_path: "/sales/carts/checkout",
    http_method: "POST",
    http_status: httpStatus,
    context: {
      source: "pos_outbox_sync",
      order_num: printedOrderNum,
      client_sale_uuid: row.client_sale_uuid,
      sync_kind: row.sync_kind ?? "sale",
      superseded_sale_id: row.superseded_sale_id ?? null,
      server_cart_id: row.server_cart_id ?? null,
    },
  });
}

/**
 * Replay pending offline cash sales to the server (oldest first).
 * Marks each row `syncing` while in flight so concurrent flushes cannot double-post.
 * On duplicate order_num (new sales only), allocates a new free number, syncs under it, and
 * flags the sale for receipt reprint with the corrected number.
 * Previous-order edits always keep the same order # and update the server record.
 */
export async function syncPosOfflineOutbox({ onProgress } = {}) {
  return withPosOfflineExclusiveLock(async () => {
    await idbReclaimStuckSyncingOutbox({ olderThanMs: 60_000 });
    const pending = await idbListPendingOutbox();
    const results = [];
    for (const row of pending) {
      const printedOrderNum = Number(row.order_num);
      const claimed = await idbMarkOutboxSyncing(row.client_sale_uuid);
      if (!claimed) continue;

      try {
        onProgress?.({ phase: "syncing", order_num: printedOrderNum });
        let sale;
        let usedOrderNum = printedOrderNum;
        let needsReprint = false;
        try {
          sale = await checkoutOutboxRow(row, printedOrderNum);
        } catch (firstErr) {
          if (isDuplicateOrderNumError(firstErr)) {
            const existing = await tryRecoverExistingOfflineSale(row, printedOrderNum);
            if (existing) {
              sale = existing;
            } else if (row.sync_kind === "previous_order_edit") {
              throw firstErr;
            } else {
              const slot = await allocateFreshOrderSlotForSync();
              usedOrderNum = Number(slot.order_num);
              onProgress?.({
                phase: "reallocate",
                order_num: usedOrderNum,
                original_order_num: printedOrderNum,
              });
              sale = await checkoutOutboxRow(row, usedOrderNum, {
                pos_order_num: slot.pos_order_num,
                pos_order_date: slot.pos_order_date,
              });
              needsReprint = usedOrderNum !== printedOrderNum;
            }
          } else {
            throw firstErr;
          }
        }

        await idbMarkOutboxSynced(row.client_sale_uuid, sale, {
          needs_reprint: needsReprint,
          order_num_changed: needsReprint,
          original_order_num: printedOrderNum,
        });
        results.push({
          ok: true,
          order_num: Number(sale?.order_num ?? usedOrderNum),
          printed_order_num: printedOrderNum,
          needs_reprint: needsReprint,
          client_sale_uuid: row.client_sale_uuid,
          sync_kind: row.sync_kind ?? "sale",
          sale,
        });
      } catch (err) {
        const message = err?.message ?? "Sync failed";
        await idbMarkOutboxError(row.client_sale_uuid, message);
        reportPosOutboxSyncFailure(row, err, printedOrderNum);
        results.push({
          ok: false,
          order_num: printedOrderNum,
          client_sale_uuid: row.client_sale_uuid,
          sync_kind: row.sync_kind ?? "sale",
          error: message,
        });
      }
    }
    return results;
  });
}

/** True when checkout should use sell→print→local→background sync (cash only).
 * Caller must also skip this when KRA fiscalization is active — the eTIMS QR only
 * exists after the device responds, so those sales stay server-first.
 */
export function isLocalFirstCashCheckout(body) {
  if (body?.is_credit_sale) return false;
  const method = String(body?.payment_method_code ?? "CASH").toUpperCase();
  if (method && method !== "CASH") return false;
  const payments = Array.isArray(body?.payments) ? body.payments : [];
  if (payments.length > 0) {
    return payments.every((p) => {
      const code = String(p?.payment_method_code ?? p?.code ?? "CASH").toUpperCase();
      return code === "CASH";
    });
  }
  return true;
}

/** Prepare for offline: catalog + order number pool. */
export async function preparePosOfflineReady() {
  const catalog = await warmPosOfflineCatalog({ force: false });
  const numbers = await ensurePosOfflineOrderNumbers({ force: false });
  return {
    catalogCount: catalog.count,
    orderNumbersAvailable: numbers.available,
    pendingSync: await getPosOfflinePendingCount(),
  };
}
