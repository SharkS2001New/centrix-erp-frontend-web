import { apiRequest, ApiError, formatApiErrorMessage } from "@/lib/api";
import {
  productMatchesCatalogQuery,
  isSellableCatalogProduct,
  stripProductStockFields,
} from "@/lib/catalog-cache";
import {
  hasPosSearchCatalog,
  hydratePosSearchIndex,
  isPosSearchIndexSnapshotValid,
  searchPosCatalogIndexAsync,
  serializePosSearchIndex,
  setPosSearchCatalog,
} from "@/lib/pos-product-search-index";
import { rankPosProductSearchResults } from "@/lib/pos-product-search-rank";
import {
  idbAppendOrderNumbers,
  idbAppendOrderSlots,
  idbClearLocalCart,
  idbClearStore,
  idbCountOrderNumbers,
  idbCountAutoRetryOutbox,
  idbCountPendingOutbox,
  idbDeleteOutboxSale,
  idbFindSyncedServerSaleIdByPosTicket,
  idbGetAllCatalog,
  idbGetCatalogProduct,
  idbGetLocalCart,
  idbGetMeta,
  idbGetOutboxSale,
  idbIsOutboxBlockingForCart,
  idbListEditableOutbox,
  idbListSyncedOutboxForBrowse,
  idbListOrderSlots,
  idbListPendingOutbox,
  idbMarkOutboxError,
  idbMarkOutboxSynced,
  idbMarkOutboxSyncing,
  idbPutCatalogProducts,
  idbPutLocalCart,
  idbPutOutboxSale,
  idbPurgeOrderSlotsUpToPosTicket,
  idbReclaimStuckSyncingOutbox,
  idbSetMeta,
  idbTakeNextOrderSlot,
  newClientSaleUuid,
  clampPosOrderBusinessDate,
  normalizePosOrderDate,
  resolveOutboxClientUuidForCart,
  todayPosOrderDate,
} from "@/lib/pos-offline-db";
import { withPosOfflineExclusiveLock } from "@/lib/pos-offline-lock";
import { roundLightStoresAmount } from "@/lib/pos-cash-round";
import { snapshotUomForPrint } from "@/lib/sale-line-items";
import { submitSystemIssueReport } from "@/lib/system-issue-reports";
import { rebuildPreviousOrderEditTenders, paymentRowsFromPreviousOrderEditTenders } from "@/lib/pos-edit-payment-adjustment";

export const POS_OFFLINE_RESERVE_COUNT = 20;
export const POS_OFFLINE_RESERVE_LOW = 5;
/** Re-warm catalog while healthy so a ~1.5h drop still has recent prices. */
export const POS_OFFLINE_CATALOG_TTL_MS = 90 * 60 * 1000;
/** Design target for drop/slow bridge (~1.5 hours) — not a hard cutoff; sync on reconnect. */
export const POS_OFFLINE_TARGET_OUTAGE_MS = 90 * 60 * 1000;

function sortCatalog(products, query) {
  return rankPosProductSearchResults(products, query, { limit: products.length });
}

const SEARCH_INDEX_META_KEY = "search_index_v1";

async function persistPosSearchIndexSnapshot(warmedAt) {
  try {
    const snapshot = serializePosSearchIndex({ warmedAt });
    if (!snapshot) return;
    await idbSetMeta(SEARCH_INDEX_META_KEY, snapshot);
  } catch {
    /* quota / private mode — in-memory index still works */
  }
}

async function tryHydratePosSearchIndex(products, warmedAt) {
  if (hasPosSearchCatalog()) return true;
  try {
    const snapshot = await idbGetMeta(SEARCH_INDEX_META_KEY);
    if (
      !isPosSearchIndexSnapshotValid(snapshot, {
        warmedAt,
        catalogCount: products.length,
      })
    ) {
      return false;
    }
    return hydratePosSearchIndex(snapshot, products);
  } catch {
    return false;
  }
}

/** Warm lean product catalog into IndexedDB for offline search. */
export async function warmPosOfflineCatalog({ force = false } = {}) {
  const last = Number((await idbGetMeta("catalog_warmed_at")) ?? 0);
  if (!force && last && Date.now() - last < POS_OFFLINE_CATALOG_TTL_MS) {
    const existing = await idbGetAllCatalog();
    if (existing.length && !hasPosSearchCatalog()) {
      const hydrated = await tryHydratePosSearchIndex(existing, last);
      if (!hydrated) {
        setPosSearchCatalog(existing, { warmedAt: last });
        void persistPosSearchIndexSnapshot(last);
      }
    }
    return { skipped: true, count: existing.length };
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
      if (isSellableCatalogProduct(product)) products.push(product);
    }
    lastPage = Number(res?.last_page ?? res?.meta?.last_page ?? page);
    page += 1;
  } while (page <= lastPage && page <= 50);

  // Full replace so soft/permanent deletes drop out of local search immediately.
  const warmedAt = Date.now();
  await idbClearStore("catalog");
  await idbPutCatalogProducts(products);
  await idbSetMeta("catalog_warmed_at", warmedAt);
  await idbSetMeta("catalog_count", products.length);
  setPosSearchCatalog(products, { warmedAt });
  void persistPosSearchIndexSnapshot(warmedAt);
  return { skipped: false, count: products.length };
}

export async function searchPosOfflineCatalog(query, { limit = 50 } = {}) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return [];

  // Prefer in-memory index (precomputed normalized fields) — target <50ms.
  if (!hasPosSearchCatalog()) {
    const all = await idbGetAllCatalog();
    if (all.length) {
      const warmedAt = Number((await idbGetMeta("catalog_warmed_at")) ?? 0) || null;
      const hydrated = await tryHydratePosSearchIndex(all, warmedAt);
      if (!hydrated) {
        setPosSearchCatalog(all, { warmedAt });
        void persistPosSearchIndexSnapshot(warmedAt);
      }
    }
  }
  if (hasPosSearchCatalog()) {
    return searchPosCatalogIndexAsync(trimmed, { limit });
  }

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

/** Peek Cash Sales # / warm session seq. Org S# pool is not used for offline selling —
 * Cash Sales # is local source of truth; server assigns organization order_num on sync.
 *
 * @param {{ force?: boolean, floatSessionId?: number|null }} [options]
 */
export async function ensurePosOfflineOrderNumbers({
  force = false,
  floatSessionId = null,
} = {}) {
  void force;
  // count=0 → peek only (no org S00xx reserve). Cash Sales # stays local-first.
  // Do NOT hold the exclusive lock across this API call — reconnect warm-up must
  // not block cashiers completing the next offline sale ("Saving…" hang).
  const body = { count: 0 };
  const sessionId = Number(floatSessionId);
  if (Number.isFinite(sessionId) && sessionId > 0) {
    body.float_session_id = sessionId;
  }
  const res = await apiRequest("/sales/order-numbers/reserve", {
    method: "POST",
    body,
    loading: false,
    reportIssues: false,
  });
  // Raise-only seed from server. Local pending 7,8,9… stay ahead of last synced #6.
  const nextPos = Number(res?.next_pos_order_num ?? 0);
  return withPosOfflineExclusiveLock(async () => {
    if (Number.isFinite(nextPos) && nextPos > 0) {
      const scoped = Number.isFinite(sessionId) && sessionId > 0;
      await seedLocalPosTicketSeq(nextPos - 1, res?.pos_order_date, scoped ? sessionId : null, {
        force: false,
      });
    }
    return {
      reserved: 0,
      available: await idbCountOrderNumbers(),
      next_pos_order_num: Number.isFinite(nextPos) && nextPos > 0 ? nextPos : null,
      pos_order_date: res?.pos_order_date ?? null,
    };
  });
}

/** Next Cash Sales # from the on-device sequence (after server reseed / local issues). */
export async function peekLocalPosTicketNext(posOrderDate = null, floatSessionId = null) {
  const today = normalizePosOrderDate(posOrderDate) ?? todayPosOrderDate();
  const key = localPosTicketSeqKey(today, floatSessionId);
  const current = Number((await idbGetMeta(key)) ?? 0);
  if (!(current > 0)) return null;
  return current + 1;
}

export async function peekPosOfflineOrderNumberCount() {
  return idbCountOrderNumbers();
}

export async function takePosOfflineOrderSlot() {
  return withPosOfflineExclusiveLock(() => idbTakeNextOrderSlot());
}

/** After a Cash Sales # is issued, drop matching reserved tickets so the pool stays sequential from 1. */
export async function purgeReservedPosTicketsUpTo(posOrderNum, posOrderDate = null) {
  return withPosOfflineExclusiveLock(() =>
    idbPurgeOrderSlotsUpToPosTicket(posOrderNum, posOrderDate),
  );
}

/**
 * Highest Cash Sales # already issued on-device for this float session (or day).
 * Does not consume the next number.
 */
export async function peekIssuedPosTicketMax(posOrderDate = null, floatSessionId = null) {
  const today = normalizePosOrderDate(posOrderDate) ?? todayPosOrderDate();
  const sessionId = Number(floatSessionId);
  const scopedSession =
    Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null;
  const key = localPosTicketSeqKey(today, scopedSession);
  let maxIssued = Number((await idbGetMeta(key)) ?? 0);

  try {
    const pending = await idbListPendingOutbox({ includeErrors: true });
    for (const row of pending ?? []) {
      const num = Number(
        row?.sale_payload?.pos_order_num ?? row?.checkout_body?.pos_order_num ?? 0,
      );
      const date =
        normalizePosOrderDate(row?.sale_payload?.pos_order_date) ??
        normalizePosOrderDate(row?.checkout_body?.pos_order_date);
      if (!(num > maxIssued) || (date && date !== today)) continue;
      const rowSession = outboxRowFloatSessionId(row);
      if (scopedSession) {
        // Count rows with no session stamp — offline sales often omit it, and
        // skipping them rewinds the next Cash Sales # onto an already-printed ticket.
        if (rowSession != null && rowSession !== scopedSession) continue;
      } else if (rowSession) {
        continue;
      }
      maxIssued = num;
    }
  } catch {
    /* ignore */
  }

  return maxIssued > 0 ? maxIssued : null;
}

/** Next Cash Sales # for a blank workspace (respects pending/failed outbox tickets). */
export async function peekNextPosTicketNumber(posOrderDate = null, floatSessionId = null) {
  const max = await peekIssuedPosTicketMax(posOrderDate, floatSessionId);
  return max != null ? max + 1 : null;
}

/** Put a consumed reserved slot back when checkout fails before the sale is stored. */
export async function returnPosOfflineOrderSlot(slot) {
  if (!slot?.order_num) return;
  await withPosOfflineExclusiveLock(() => idbAppendOrderSlots([slot]));
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
  if (existing) {
    const hasLines = (existing.lines?.length ?? 0) > 0;
    const isQueuedEdit = Boolean(existing.offline_client_sale_uuid);
    const isPreviousOrderEdit = Boolean(existing.superseded_sale_id && existing.held_order_num);

    // Failed / synced / missing outbox must not seed the next sale's lines.
    if (existing.offline_client_sale_uuid) {
      const outbox = await idbGetOutboxSale(String(existing.offline_client_sale_uuid));
      const status = outbox?.sync_status ?? null;
      if (!outbox || status === "error" || status === "synced") {
        await idbClearLocalCart("active");
        const cart = emptyLocalPosCart(seed);
        await idbPutLocalCart(cart);
        return cart;
      }
    }

    // Abandoned shells from a completed/failed sale must not hijack the next ticket.
    if (!hasLines && !isQueuedEdit && !isPreviousOrderEdit && existing.held_order_num) {
      await idbClearLocalCart("active");
    } else if (hasLines || isQueuedEdit || isPreviousOrderEdit) {
      // Keep lines / active edit sessions. Empty offline shells alone must not hijack F8.
      // Keep lines, but refresh till/session from the open float after a new day.
      const nextTill = seed.till_id ?? existing.till_id ?? null;
      const nextSession = seed.float_session_id ?? existing.float_session_id ?? null;
      if (
        String(existing.till_id ?? "") !== String(nextTill ?? "") ||
        String(existing.float_session_id ?? "") !== String(nextSession ?? "")
      ) {
        const refreshed = {
          ...existing,
          till_id: nextTill,
          float_session_id: nextSession,
          updated_at_ms: Date.now(),
        };
        await idbPutLocalCart(refreshed);
        return refreshed;
      }
      return existing;
    } else if (existing) {
      return existing;
    }
  }
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
    ...(cart.original_order_total != null
      ? { original_order_total: Number(cart.original_order_total) }
      : {}),
    ...(Array.isArray(cart.payment_adjustments) && cart.payment_adjustments.length
      ? { payment_adjustments: cart.payment_adjustments }
      : {}),
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

export {
  clearPosSessionLocalCache,
  ensurePosOfflineOwnerIsolation,
  settlePendingPosOfflineWipe,
  isPosOfflineWipePending,
} from "@/lib/pos-session-local-cache";

export function isServerPosCartId(id) {
  return id != null && String(id) !== "active" && /^\d+$/.test(String(id));
}

export {
  clampPosOrderBusinessDate,
  normalizePosOrderDate,
  todayPosOrderDate,
  idbFindSyncedServerSaleIdByPosTicket,
} from "@/lib/pos-offline-db";

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

/** Resolve a live TemporaryCart id for PUT/checkout during previous-order edit sync. */
export async function resolvePreviousOrderEditServerCartId(cart) {
  if (isServerPosCartId(cart?.id)) {
    return Number(cart.id);
  }
  const supersededId = Number(cart?.superseded_sale_id ?? 0);
  if (!supersededId) return null;
  const restored = await apiRequest(`/sales/orders/${supersededId}/restore-to-cart`, {
    method: "POST",
    body: { replace: true },
    loading: false,
    reportIssues: false,
  });
  return restored?.id && isServerPosCartId(restored.id) ? Number(restored.id) : null;
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
        amount: line.amount != null ? Number(line.amount) : undefined,
        product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
        vat_rate: Number(line.vat_rate ?? line.tax_rate ?? line.product_vat ?? 0),
      };
    })
    .filter(Boolean);
}

/**
 * Mid-sale outage: keep selling on the open cart in place.
 *
 * Do not rebuild/re-key lines from a TemporaryCart copy — that raced with classic
 * POS adds and spawned duplicate rows when the link flapped. Persist a snapshot
 * for crash recovery only; completed-sale sync stays in the outbox.
 */
export async function continueOpenCartThroughOutage(openCart, seed = {}) {
  if (!openCart) return null;

  if (openCart.offline && Array.isArray(openCart.lines)) {
    const collapsed = collapseCombineableLocalLines(openCart.lines);
    const next =
      collapsed.length === openCart.lines.length
        ? openCart
        : { ...openCart, lines: collapsed, updated_at_ms: Date.now() };
    try {
      await saveLocalPosCart(next);
    } catch {
      /* keep in-memory cart even if IDB write fails */
    }
    return next;
  }

  // Classic Enter-repeat / stale merge during a link flap can leave several
  // optimistic rows for the same SKU — collapse them so offline sell stays normal.
  const lines = collapseCombineableLocalLines(
    (openCart.lines ?? [])
      .map((line) => {
        const qty = Number(line.quantity ?? 0);
        if (!line?.product_code || !(qty > 0)) return null;
        const clientLineId = String(
          line.client_line_id ?? line.update_code ?? line.id ?? newClientSaleUuid(),
        );
        const { _optimistic: _dropOptimistic, ...rest } = line;
        return {
          ...rest,
          client_line_id: clientLineId,
          product_code: line.product_code,
          product_name: line.product_name ?? line.description ?? line.product_code,
          quantity: qty,
          unit_price: Number(line.unit_price ?? line.price ?? 0),
          display_unit_price:
            line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
          amount: line.amount != null ? Number(line.amount) : undefined,
          uom: line.uom ?? null,
          unit_id: line.unit_id ?? line.product?.unit_id ?? line.product?.unit?.id ?? null,
          unit:
            snapshotUomForPrint(line.unit) ??
            snapshotUomForPrint(line.product?.unit ?? line.product?.uom),
          on_wholesale_retail: Boolean(Number(line.on_wholesale_retail ?? 0)),
          discount_given: Number(line.discount_given ?? 0),
          product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
          vat_rate: Number(line.vat_rate ?? line.tax_rate ?? 0),
        };
      })
      .filter(Boolean),
  );

  const migratedFrom =
    isServerPosCartId(openCart.id) ? openCart.id : openCart.migrated_from_online_cart_id ?? null;

  const local = {
    id: "active",
    offline: true,
    channel: "pos",
    lines,
    branch_id: openCart.branch_id ?? seed.branch_id ?? null,
    till_id: openCart.till_id ?? seed.till_id ?? null,
    float_session_id: openCart.float_session_id ?? seed.float_session_id ?? null,
    customer_num: openCart.customer_num ?? null,
    customer_name_override: openCart.customer_name_override ?? null,
    order_discount: Number(openCart.order_discount ?? 0) || 0,
    held_order_num: openCart.held_order_num ?? null,
    superseded_sale_id: openCart.superseded_sale_id ?? null,
    offline_client_sale_uuid: openCart.offline_client_sale_uuid ?? null,
    offline_edit_snapshot: openCart.offline_edit_snapshot ?? null,
    migrated_from_online_cart_id: migratedFrom,
    updated_at_ms: Date.now(),
  };

  try {
    await idbPutLocalCart(local);
  } catch {
    /* in-memory continue still works */
  }
  return local;
}

/** @deprecated Use {@link continueOpenCartThroughOutage} — kept for older call sites. */
export async function adoptOnlineCartForOffline(onlineCart, seed = {}) {
  return continueOpenCartThroughOutage(onlineCart, seed);
}

/** Merge key matches classic POS merge (SKU + retail/wholesale), not UOM label. */
function lineKey(line) {
  return `${line.product_code}|${Number(line.on_wholesale_retail) ? 1 : 0}`;
}

/**
 * Collapse duplicate SKU (+ retail/wholesale) rows into one line.
 * Used when adopting a TemporaryCart that grew duplicate optimistic rows mid-outage.
 */
export function collapseCombineableLocalLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return lines ?? [];
  const byKey = new Map();
  for (const line of lines) {
    if (!line?.product_code) continue;
    const key = lineKey(line);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line });
      continue;
    }
    const nextQty = Number(existing.quantity ?? 0) + Number(line.quantity ?? 0);
    const existingAmount =
      existing.amount != null && Number.isFinite(Number(existing.amount))
        ? Number(existing.amount)
        : Number(existing.quantity ?? 0) * Number(existing.unit_price ?? 0);
    const addAmount =
      line.amount != null && Number.isFinite(Number(line.amount))
        ? Number(line.amount)
        : Number(line.quantity ?? 0) * Number(line.unit_price ?? 0);
    byKey.set(key, {
      ...existing,
      ...line,
      client_line_id: existing.client_line_id ?? line.client_line_id,
      quantity: nextQty,
      unit_price: Number(line.unit_price ?? existing.unit_price ?? 0),
      amount: Math.round((existingAmount + addAmount) * 100) / 100,
      discount_given:
        Number(existing.discount_given ?? 0) + Number(line.discount_given ?? 0),
    });
  }
  return [...byKey.values()];
}

export async function upsertLocalPosCartLine(cart, line) {
  const lines = [...(cart.lines ?? [])];
  const key = lineKey(line);
  const idx = lines.findIndex((l) => lineKey(l) === key);
  if (idx >= 0) {
    lines[idx] = {
      ...lines[idx],
      ...line,
      // Keep the first identity so repeat adds update the same row.
      client_line_id: lines[idx].client_line_id ?? line.client_line_id,
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

export function summarizeLocalPosCart(cart, { cashRound = false } = {}) {
  const lines = cart?.lines ?? [];
  let total = 0;
  let vat = 0;
  const lineAmounts = [];
  for (const line of lines) {
    const qty = Number(line.quantity ?? 0);
    const price = Number(line.unit_price ?? 0);
    const amount =
      line.amount != null && Number.isFinite(Number(line.amount))
        ? Math.round(Number(line.amount) * 100) / 100
        : Math.round(qty * price * 100) / 100;
    lineAmounts.push(amount);
    total += amount;
    const rate = Number(line.vat_rate ?? line.tax_rate ?? 0);
    if (rate > 0) {
      vat += Math.round(((amount * rate) / (100 + rate)) * 100) / 100;
    }
  }
  const orderDiscount = Math.min(
    Math.max(0, Number(cart?.order_discount ?? 0) || 0),
    total,
  );
  if (cashRound) {
    // Match checkout: round each line, subtract discount, round the order total.
    const roundedNet = lineAmounts.reduce(
      (sum, amount) => sum + roundLightStoresAmount(amount),
      0,
    );
    total = roundLightStoresAmount(Math.max(0, roundedNet - orderDiscount));
  } else {
    total = Math.round(Math.max(0, total - orderDiscount) * 100) / 100;
  }
  vat = Math.round(vat * 100) / 100;
  return {
    total,
    vat,
    amountDue: total,
    lineCount: lines.length,
  };
}

/** POS ticket # fields from cart / sale snapshot (for receipts). */
export function posTicketFieldsFromCart(cart) {
  if (!cart) return { pos_order_num: null, pos_order_date: null };
  const posOrderNum =
    cart.pos_order_num != null && Number(cart.pos_order_num) > 0
      ? Number(cart.pos_order_num)
      : cart.next_pos_order_num != null && Number(cart.next_pos_order_num) > 0
        ? Number(cart.next_pos_order_num)
        : null;
  const posOrderDate =
    normalizePosOrderDate(cart.pos_order_date) ??
    normalizePosOrderDate(cart.next_pos_order_date) ??
    (posOrderNum != null ? todayPosOrderDate() : null);
  return { pos_order_num: posOrderNum, pos_order_date: posOrderDate };
}

/**
 * POS ticket # to print for this checkout — uses cart/API fields, the on-screen # box,
 * and the next reserved offline slot (without consuming it).
 */
export function resolvePosTicketForCheckout(cart, options = {}) {
  const { editOrderNo = "", sourceSale = null, pendingSlot = null } = options;
  const today = todayPosOrderDate();

  const isPreviousEdit = Boolean(cart?.held_order_num && cart?.superseded_sale_id);
  if (isPreviousEdit) {
    const ticket = posTicketFieldsFromCart({
      ...cart,
      pos_order_num: cart?.pos_order_num ?? sourceSale?.pos_order_num ?? null,
      pos_order_date: cart?.pos_order_date ?? sourceSale?.pos_order_date ?? null,
    });
    if (ticket.pos_order_num != null) return ticket;
  }

  const fromCart = posTicketFieldsFromCart(cart);
  if (fromCart.pos_order_num != null) return fromCart;

  if (pendingSlot?.pos_order_num != null && Number(pendingSlot.pos_order_num) > 0) {
    return {
      pos_order_num: Number(pendingSlot.pos_order_num),
      pos_order_date:
        normalizePosOrderDate(pendingSlot.pos_order_date) ??
        fromCart.pos_order_date ??
        today,
    };
  }

  const trimmed = String(editOrderNo ?? "").trim();
  if (trimmed) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) {
      return { pos_order_num: n, pos_order_date: fromCart.pos_order_date ?? today };
    }
  }

  return { pos_order_num: null, pos_order_date: null };
}

/** Next reserved org/POS slot pair (FIFO) without consuming it. */
export async function peekNextPosOfflineOrderSlot() {
  const slots = await idbListOrderSlots();
  return slots[0] ?? null;
}

/**
 * Seed local Cash Sales counter.
 * Local is source of truth for the open float session: never lower a positive counter
 * (offline 7,8,9… must stay ahead of last synced #6). Server / sync may only raise.
 * `force: true` with lastIssued 0 resets a brand-new session key after Z/reopen.
 *
 * @param {number} lastIssued - highest Cash Sales # already issued (0 → next is 1)
 * @param {string|null} [posOrderDate]
 * @param {number|null} [floatSessionId] - when set, seq is scoped to this till session
 * @param {{ force?: boolean }} [options]
 */
export async function seedLocalPosTicketSeq(
  lastIssued,
  posOrderDate = null,
  floatSessionId = null,
  { force = false } = {},
) {
  const today = normalizePosOrderDate(posOrderDate) ?? todayPosOrderDate();
  const key = localPosTicketSeqKey(today, floatSessionId);
  const current = Number((await idbGetMeta(key)) ?? 0);
  const floor = Math.max(0, Number(lastIssued) || 0);
  if (floor > current) {
    await idbSetMeta(key, floor);
    return;
  }
  // New float session only — never rewind to an older positive watermark.
  if (force && floor === 0 && current !== 0) {
    await idbSetMeta(key, 0);
  }
}

/** Align local Cash Sales counter after a server sale response (same float session only). */
export async function seedLocalPosTicketSeqFromSale(sale, activeFloatSessionId = null) {
  const num = Number(sale?.pos_order_num ?? 0);
  if (!Number.isFinite(num) || num <= 0) return;
  const saleSession = Number(sale?.float_session_id ?? 0) || null;
  const activeSession = Number(activeFloatSessionId ?? 0) || null;
  // Never raise the new session counter from a prior-session (or day-scoped) ticket.
  if (activeSession && saleSession && saleSession !== activeSession) return;
  if (activeSession && !saleSession) return;
  await seedLocalPosTicketSeq(num, sale?.pos_order_date, activeSession ?? saleSession);
}

/**
 * IndexedDB meta key for the on-device Cash Sales counter.
 * Prefer float-session scope so Z/reopen starts at #1 even on the same day.
 */
function localPosTicketSeqKey(posOrderDate, floatSessionId = null) {
  const today = normalizePosOrderDate(posOrderDate) ?? todayPosOrderDate();
  const sessionId = Number(floatSessionId);
  if (Number.isFinite(sessionId) && sessionId > 0) {
    return `pos_ticket_seq_${today}_s${sessionId}`;
  }
  return `pos_ticket_seq_${today}`;
}

function outboxRowFloatSessionId(row) {
  const raw =
    row?.cart_seed?.float_session_id ??
    row?.sale_payload?.float_session_id ??
    row?.checkout_body?.float_session_id ??
    null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Next Cash Sales # for this float session (or cashier/day) on-device:
 * max(local seq, pending outbox for the same session) + 1.
 * Independent of reserved S00xx org numbers.
 */
async function allocateLocalPosTicketNumber(floatSessionId = null) {
  const today = todayPosOrderDate();
  const sessionId = Number(floatSessionId);
  const scopedSession =
    Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null;
  const key = localPosTicketSeqKey(today, scopedSession);
  let current = Number((await idbGetMeta(key)) ?? 0);

  // Pending outbox may already hold higher tickets sold offline but not synced.
  // Only count tickets from the same float session (or day-scoped when no session).
  try {
    const pending = await idbListPendingOutbox();
    for (const row of pending ?? []) {
      const num = Number(
        row?.sale_payload?.pos_order_num ?? row?.checkout_body?.pos_order_num ?? 0,
      );
      const date =
        normalizePosOrderDate(row?.sale_payload?.pos_order_date) ??
        normalizePosOrderDate(row?.checkout_body?.pos_order_date);
      if (!(num > current) || (date && date !== today)) continue;
      const rowSession = outboxRowFloatSessionId(row);
      if (scopedSession) {
        if (rowSession != null && rowSession !== scopedSession) continue;
      } else if (rowSession) {
        continue;
      }
      current = num;
    }
  } catch {
    /* ignore */
  }

  const next = current + 1;
  await idbSetMeta(key, next);
  return { pos_order_num: next, pos_order_date: today };
}

/** Merge POS ticket # onto a sale for thermal print (preserves checkout snapshot). */
export function withPosReceiptTicket(sale, cartOrSource = null) {
  if (!sale) return sale;
  const ticket = posTicketFieldsFromCart(cartOrSource ?? sale);
  const posOrderNum =
    sale.pos_order_num != null && Number(sale.pos_order_num) > 0
      ? Number(sale.pos_order_num)
      : ticket.pos_order_num;
  const posOrderDate =
    normalizePosOrderDate(sale.pos_order_date) ??
    ticket.pos_order_date ??
    null;
  return {
    ...sale,
    channel: sale.channel ?? cartOrSource?.channel ?? "pos",
    order_source: sale.order_source ?? cartOrSource?.order_source ?? "pos",
    ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
    ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
  };
}

/**
 * Complete a local POS sale: reserved order # (or reuse for edits), queue outbox, clear cart.
 * Supports Cash / M-Pesa / bank / cheque tenders (and credit fully unpaid). Non-credit sales
 * are always marked paid; credit (I + registered customer) always saves as fully unpaid.
 * Supports:
 * - new sale (takes reserved order #)
 * - revising a pending offline sale (same client uuid + order #)
 * - previous-order edit (reuse held order #; sync updates the server record)
 *
 * @param {{ keepCart?: boolean, skipClearDraft?: boolean, paymentMethodCode?: string, paymentSplits?: object[], isCreditSale?: boolean, paymentReference?: string|null, paymentDate?: string|null, workflowStatus?: string|null }} [options]
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
  cashRound = false,
  paymentMethodCode: paymentMethodCodeOpt = null,
  paymentSplits: paymentSplitsOpt = null,
  isCreditSale: isCreditSaleOpt = false,
  paymentReference = null,
  paymentDate = null,
  workflowStatus = null,
}) {
  const summary = summarizeLocalPosCart(cart, { cashRound: Boolean(cashRound) });
  const reuseOrderNumEarly =
    cart.held_order_num != null && Number(cart.held_order_num) > 0
      ? Number(cart.held_order_num)
      : null;
  const supersededSaleIdEarly =
    cart.superseded_sale_id != null && Number(cart.superseded_sale_id) > 0
      ? Number(cart.superseded_sale_id)
      : null;
  const isPreviousOrderEditEarly = Boolean(
    reuseOrderNumEarly && supersededSaleIdEarly,
  );
  if (!summary.lineCount && !isPreviousOrderEditEarly) {
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
    // Revising a queued offline sale — keep printed Cash Sales # and outbox identity.
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
    // No org S# pool. Cash Sales # is allocated below; server assigns order_num on sync.
    orderNum = null;
    posOrderNum = null;
    posOrderDate = todayPosOrderDate();
    if (cart.next_pos_order_num != null) {
      posOrderDate =
        clampPosOrderBusinessDate(cart.next_pos_order_date) ??
        posOrderDate ??
        todayPosOrderDate();
    }
    clientSaleUuid = newClientSaleUuid();
    syncKind = "sale";
  }

  const existingOutbox = clientSaleUuid ? await idbGetOutboxSale(clientSaleUuid) : null;
  if (existingOutbox?.sync_kind === "previous_order_edit") {
    syncKind = "previous_order_edit";
  }
  if (existingOutbox?.sale_payload?.pos_order_num != null) {
    posOrderNum = Number(existingOutbox.sale_payload.pos_order_num);
    posOrderDate =
      normalizePosOrderDate(existingOutbox.sale_payload.pos_order_date) ?? posOrderDate;
  } else if (cart.pos_order_num != null && Number(cart.pos_order_num) > 0) {
    posOrderNum = Number(cart.pos_order_num);
    posOrderDate = normalizePosOrderDate(cart.pos_order_date) ?? posOrderDate;
  }
  if (posOrderNum == null) {
    const fromCart = posTicketFieldsFromCart(cart);
    if (fromCart.pos_order_num != null) {
      posOrderNum = fromCart.pos_order_num;
      posOrderDate = fromCart.pos_order_date ?? posOrderDate;
    }
  }
  if (posOrderNum == null && !isPreviousOrderEdit && !editingUuid) {
    const localTicket = await allocateLocalPosTicketNumber(
      floatSessionId ?? cart.float_session_id ?? null,
    );
    posOrderNum = localTicket.pos_order_num;
    posOrderDate = localTicket.pos_order_date ?? posOrderDate;
  }
  posOrderDate = clampPosOrderBusinessDate(posOrderDate);

  // Always raise the on-device Cash Sales counter when a ticket is issued from the
  // cart's next_pos_order_num (allocateLocalPosTicketNumber already writes the seq).
  // Skipping this left seq stuck on the prior receipt so F8 / clear workspace could
  // rewind onto an already-printed number (e.g. sold #27 offline, next showed #26).
  if (posOrderNum != null && !isPreviousOrderEdit) {
    try {
      await seedLocalPosTicketSeq(
        Number(posOrderNum),
        posOrderDate,
        floatSessionId ?? cart.float_session_id ?? null,
      );
    } catch {
      /* non-fatal — peek still consults pending outbox */
    }
  }

  // New offline sales (and their revisions): Cash Sales # is the till label.
  // Organization order_num is assigned by the server on sync — never pre-reserved.
  const deferOrgOrderNum = syncKind !== "previous_order_edit";
  if (deferOrgOrderNum && (orderNum == null || !(Number(orderNum) > 0)) && posOrderNum != null) {
    orderNum = Number(posOrderNum);
  }
  if (deferOrgOrderNum && !(Number(orderNum) > 0)) {
    throw new Error("Could not allocate a Cash Sales # for this sale.");
  }

  const soldAtMs = existingOutbox?.created_at_ms ?? Date.now();
  const soldAtIso = new Date(soldAtMs).toISOString();

  // Previous-order edits: keep credit only when the prior sale was an explicit credit sale.
  // Do not infer credit from payment_method_code alone (that marked cash edits as credit).
  const priorWasCreditSale = Boolean(
    cart.is_credit_sale ??
      existingOutbox?.sale_payload?.is_credit_sale ??
      existingOutbox?.checkout_body?.is_credit_sale ??
      cart.offline_edit_snapshot?.is_credit_sale,
  );
  let isCreditSale = isPreviousOrderEdit
    ? priorWasCreditSale
    : Boolean(isCreditSaleOpt);
  const requestedPay = Math.max(0, Number(cashAmount ?? 0));

  const paymentSplits = Array.isArray(paymentSplitsOpt)
    ? paymentSplitsOpt
        .filter((part) => part && Number(part.amount) > 0)
        .map((part) => ({
          method_code: String(part.method_code ?? part.code ?? "").trim().toUpperCase(),
          amount: Math.round(Number(part.amount) * 100) / 100,
          ...(part.reference_number
            ? { reference_number: String(part.reference_number).trim() }
            : {}),
        }))
        .filter((part) => part.method_code)
    : [];

  const splitTendered = paymentSplits.reduce(
    (sum, part) => sum + Number(part.amount ?? 0),
    0,
  );
  const nonCreditTendered =
    paymentSplits.length > 0 ? splitTendered : requestedPay;

  // I then C/M/E/K with full tender: never book as credit A/R (cashier changed mind).
  if (
    !isPreviousOrderEdit &&
    isCreditSale &&
    Number(summary.amountDue) > 0.01 &&
    nonCreditTendered + 0.01 >= Number(summary.amountDue)
  ) {
    isCreditSale = false;
  }

  // Cash / M-Pesa / Equity / KCB / bank / cheque must cover the bill.
  // Credit (I + registered customer) always saves as fully unpaid — no partial A/R.
  if (
    !isCreditSale &&
    !isPreviousOrderEdit &&
    Number(summary.amountDue) > 0.01 &&
    nonCreditTendered + 0.01 < Number(summary.amountDue)
  ) {
    throw new Error(
      "Full payment required for Cash, M-Pesa, bank, and cheque. Select a credit customer (I) to save as fully unpaid.",
    );
  }

  // Non-credit: settle in full. Credit sales from POS are always fully unpaid.
  const payNow = isCreditSale ? 0 : Math.max(nonCreditTendered, summary.amountDue);

  // Previous-order edits must keep the original tender method on the local sale /
  // checkout body. Hardcoding CASH caused synced sales to show Cash after edit.
  const paymentMethodCode = (() => {
    if (isPreviousOrderEdit) {
      const candidates = [
        cart.payment_method_code,
        existingOutbox?.sale_payload?.payment_method_code,
        existingOutbox?.checkout_body?.payment_method_code,
        cart.offline_edit_snapshot?.payment_method_code,
      ];
      for (const raw of candidates) {
        const code = String(raw ?? "").trim().toUpperCase();
        if (!code) continue;
        // Non-credit revise must not keep a CREDIT tender code (server rejects / partial A/R).
        if (code === "CREDIT" && !isCreditSale) return "CASH";
        return code;
      }
      return "CASH";
    }
    const fromOpt = String(paymentMethodCodeOpt ?? "").trim().toUpperCase();
    if (fromOpt && fromOpt !== "CREDIT") return fromOpt;
    if (fromOpt === "CREDIT" && !isCreditSale) {
      // Stale CREDIT after full C/M/E/K pay — settle as cash.
      return "CASH";
    }
    if (fromOpt) return fromOpt;
    if (isCreditSale && payNow <= 0.01) return "CREDIT";
    return "CASH";
  })();
  const paymentMethodLabel =
    paymentMethodCode === "CASH"
      ? "Cash"
      : paymentMethodCode === "MPESA"
        ? "M-Pesa"
        : paymentMethodCode === "CREDIT"
          ? "Credit"
          : paymentMethodCode === "EQUITY"
            ? "Equity"
            : paymentMethodCode === "KCB"
              ? "KCB"
              : paymentMethodCode;

  // paymentSplits normalized above

  const sumSplit = (code) =>
    Math.round(
      paymentSplits
        .filter((part) => part.method_code === code)
        .reduce((sum, part) => sum + Number(part.amount ?? 0), 0) * 100,
    ) / 100;

  const tenderCash =
    paymentSplits.length > 0
      ? sumSplit("CASH")
      : paymentMethodCode === "CASH"
        ? payNow
        : 0;
  const tenderMpesa =
    paymentSplits.length > 0
      ? sumSplit("MPESA")
      : paymentMethodCode === "MPESA"
        ? payNow
        : 0;
  const tenderEquity =
    paymentSplits.length > 0
      ? sumSplit("EQUITY")
      : paymentMethodCode === "EQUITY"
        ? payNow
        : 0;
  const tenderKcb =
    paymentSplits.length > 0
      ? sumSplit("KCB")
      : paymentMethodCode === "KCB"
        ? payNow
        : 0;

  // Prefer the cart customer. When revising a queued offline sale, trust the cart
  // only — never resurrect Customer A after the cashier cleared to Walk-in.
  const revisingQueuedOffline = Boolean(editingUuid);
  const customerNumRaw = revisingQueuedOffline
    ? cart.customer_num
    : (cart.customer_num ??
      existingOutbox?.sale_payload?.customer_num ??
      existingOutbox?.checkout_body?.customer_num ??
      null);
  const customerNum =
    customerNumRaw != null && Number(customerNumRaw) > 0 ? Number(customerNumRaw) : null;
  if (isCreditSale && !(customerNum > 0)) {
    throw new Error(
      "Credit sales require a registered customer. Walk-in sales cannot be charged to accounts receivable.",
    );
  }
  const customerNameOverride = revisingQueuedOffline
    ? (String(cart.customer_name_override ?? "").trim() || null)
    : (
        String(cart.customer_name_override ?? "").trim() ||
        String(existingOutbox?.sale_payload?.customer_name_override ?? "").trim() ||
        String(existingOutbox?.checkout_body?.customer_name_override ?? "").trim() ||
        null
      );
  const customerKraPin = revisingQueuedOffline
    ? (String(cart.customer_kra_pin ?? "").trim() || null)
    : (
        String(cart.customer_kra_pin ?? "").trim() ||
        String(existingOutbox?.checkout_body?.customer_kra_pin ?? "").trim() ||
        null
      );

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
      display_unit_price:
        line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
      amount: lineAmount,
      uom: line.uom ?? null,
      unit_id: unitId,
      unit,
      on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) === 1,
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

  const editAdjustments = Array.isArray(cart.payment_adjustments)
    ? cart.payment_adjustments.filter((row) => Number(row?.amount) > 0)
    : [];
  // Always rebuild from the ORIGINAL sale snapshot — never from a prior outbox
  // sale_payload (that already includes prior+topup and would double M-Pesa).
  const editSourceSaleRaw =
    cart.offline_edit_snapshot && typeof cart.offline_edit_snapshot === "object"
      ? cart.offline_edit_snapshot
      : existingOutbox?.prior_sale_snapshot &&
          typeof existingOutbox.prior_sale_snapshot === "object"
        ? existingOutbox.prior_sale_snapshot
        : null;
  const editSourceSale = editSourceSaleRaw
    ? {
        ...editSourceSaleRaw,
        order_total:
          Number(
            editSourceSaleRaw.order_total ??
              cart.original_order_total ??
              editSourceSaleRaw.amount_paid ??
              0,
          ) || editSourceSaleRaw.order_total,
      }
    : Number(cart.original_order_total) > 0
      ? {
          order_total: Number(cart.original_order_total),
          amount_paid: Number(cart.original_order_total),
          payment_method_code: cart.payment_method_code ?? "CASH",
        }
      : null;
  // Empty previous-order cancel must carry a full return. If the cashier never
  // finished the payment dialog, synthesize one from the prior tender method.
  let editAdjustmentsForCheckout = editAdjustments;
  if (isPreviousOrderEdit && summary.lineCount === 0) {
    const priorTotal = Number(
      editSourceSale?.order_total ??
        editSourceSale?.amount_paid ??
        cart.original_order_total ??
        0,
    );
    const returnSum = editAdjustments
      .filter((row) => row.adjustment_type === "return")
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (priorTotal > 0.009 && Math.abs(returnSum - priorTotal) > 0.02) {
      const method =
        String(
          editAdjustments.find((row) => row.adjustment_type === "return")?.method_code ??
            cart.payment_method_code ??
            editSourceSale?.payment_method_code ??
            "CASH",
        )
          .trim()
          .toUpperCase() || "CASH";
      editAdjustmentsForCheckout = [
        {
          method_code: method,
          amount: Math.round(priorTotal * 100) / 100,
          adjustment_type: "return",
          reference_number: null,
        },
      ];
    }
  }
  const editTenders = isPreviousOrderEdit
    ? rebuildPreviousOrderEditTenders(editSourceSale, editAdjustmentsForCheckout, summary.total)
    : null;
  const reconciledEditAdjustments = Array.isArray(editTenders?.adjustments)
    ? editTenders.adjustments
    : editAdjustmentsForCheckout;

  // Empty previous-order revise = cancel online (print path uses cancelled / refunded).
  const isEmptyPreviousOrderCancel =
    isPreviousOrderEdit && Number(summary.lineCount ?? 0) === 0;

  // Prefer rebuilt edit tenders for credit unpaid/partial; never force "paid" on edit.
  const amountPaidFinal = isEmptyPreviousOrderCancel
    ? 0
    : editTenders
      ? Math.max(0, Number(editTenders.amountPaid) || 0)
      : isCreditSale
        ? payNow
        : summary.total;
  const paymentStatusFinal = (() => {
    if (isEmptyPreviousOrderCancel) return "refunded";
    if (!isCreditSale) return "paid";
    if (amountPaidFinal + 0.01 >= summary.total && summary.total > 0) return "paid";
    if (amountPaidFinal > 0.01) return "partial";
    return "unpaid";
  })();
  const saleWorkflowStatusFinal = isEmptyPreviousOrderCancel
    ? "cancelled"
    : String(workflowStatus ?? "").trim() ||
      (paymentStatusFinal === "paid"
        ? "paid"
        : paymentStatusFinal === "partial"
          ? "pending_payment"
          : "unpaid");

  const sale = {
    id: `offline:${clientSaleUuid}`,
    client_sale_uuid: clientSaleUuid,
    order_num: orderNum,
    ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
    ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
    organization_id: organization?.id ?? user?.organization_id ?? null,
    branch_id: cart.branch_id ?? user?.branch_id ?? null,
    // Prefer the open session till when both are present (avoids stale IDB/server cart till).
    till_id: cart.till_id ?? null,
    float_session_id: floatSessionId ?? cart.float_session_id ?? null,
    cashier_id: user?.id ?? null,
    created_by: user?.id ?? null,
    channel: "pos",
    order_source: "pos",
    status: saleWorkflowStatusFinal,
    payment_status: paymentStatusFinal,
    payment_method_code: paymentMethodCode,
    is_credit_sale: isCreditSale,
    order_total: isEmptyPreviousOrderCancel ? 0 : summary.total,
    total_vat: isEmptyPreviousOrderCancel ? 0 : summary.vat,
    amount_paid: amountPaidFinal,
    cash: editTenders
      ? editTenders.cash
      : tenderCash,
    mpesa_amount: editTenders
      ? editTenders.mpesa
      : tenderMpesa,
    equity_amount: editTenders ? editTenders.equity : tenderEquity,
    kcb_amount: editTenders ? editTenders.kcb : tenderKcb,
    completed_at: soldAtIso,
    created_at: soldAtIso,
    created_at_ms: soldAtMs,
    customer_num: customerNum,
    customer_name_override: customerNameOverride,
    offline_pending_sync: true,
    superseded_sale_id: supersededSaleId,
    ...(reconciledEditAdjustments.length
      ? { payment_adjustments: reconciledEditAdjustments }
      : {}),
    ...(editTenders?.returnGiven > 0.0001
      ? { _change_given: editTenders.returnGiven, order_change: editTenders.returnGiven }
      : {}),
    ...(editTenders?.topupAmount > 0.0001
      ? { _topup_amount: editTenders.topupAmount }
      : {}),
    items: saleItems,
    payments: editTenders
      ? paymentRowsFromPreviousOrderEditTenders(editTenders)
      : paymentSplits.length > 0
        ? paymentSplits.map((part, index) => ({
            id: index + 1,
            payment_method_code: part.method_code,
            amount: part.amount,
            reference_number: part.reference_number ?? null,
            payment_method: { code: part.method_code, name: part.method_code },
          }))
        : amountPaidFinal > 0.01
          ? [
              {
                id: 1,
                payment_method_code: paymentMethodCode,
                amount: amountPaidFinal,
                payment_method: { code: paymentMethodCode, name: paymentMethodLabel },
              },
            ]
          : [],
  };

  const wasSyncing = existingOutbox?.sync_status === "syncing";
  const contentRevision = Number(existingOutbox?.content_revision ?? 0) + 1;
  const outbox = {
    client_sale_uuid: clientSaleUuid,
    order_num: orderNum,
    // Cash Sales # is the till ticket; org S# is assigned on sync for new offline sales.
    defer_org_order_num: deferOrgOrderNum,
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
    // Original tenders before this edit — never overwritten with rebuilt sale_payload.
    prior_sale_snapshot:
      editSourceSale ??
      existingOutbox?.prior_sale_snapshot ??
      null,
    sale_payload: sale,
    checkout_body: {
      ...(deferOrgOrderNum ? {} : { order_num: orderNum }),
      ...(deferOrgOrderNum ? { defer_org_order_num: true } : {}),
      ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
      ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
      payment_method_code: paymentMethodCode,
      pay_now: isPreviousOrderEdit ? 0 : payNow,
      is_credit_sale: isCreditSale,
      payment_status: paymentStatusFinal,
      ...(saleWorkflowStatusFinal ? { status: saleWorkflowStatusFinal } : {}),
      ...(paymentReference ? { payment_reference: String(paymentReference).trim() } : {}),
      ...(paymentDate ? { payment_date: paymentDate } : {}),
      ...(paymentSplits.length > 0 && !isPreviousOrderEdit
        ? { payment_splits: paymentSplits }
        : {}),
      submit_kra: false,
      offline_order: true,
      client_completed_at: soldAtIso,
      client_sale_uuid: clientSaleUuid,
      // Revision-aware sync key so an edit before upload sends the latest payload.
      content_revision: contentRevision,
      float_session_id: sale.float_session_id,
      customer_num: customerNum,
      customer_name_override: customerNameOverride,
      ...(customerKraPin ? { customer_kra_pin: customerKraPin } : {}),
      total_vat: sale.total_vat,
      sales_workspace: "pos",
      ...(reconciledEditAdjustments.length
        ? { payment_adjustments: reconciledEditAdjustments }
        : {}),
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
      unit_id: item.unit_id ?? null,
      unit: item.unit ?? null,
      on_wholesale_retail: item.on_wholesale_retail,
      discount_given: item.discount_given,
      product_name: item.product_name,
      display_unit_price: item.display_unit_price,
      product_vat: item.product_vat,
      amount: item.amount,
    })),
  };

  await withPosOfflineExclusiveLock(async () => {
    await idbPutOutboxSale(outbox);
  });
  if (!keepCart) {
    await clearLocalPosCart();
  }
  if (!skipClearDraft && !keepCart) {
    await clearPreviousOrderEditDraft().catch(() => {});
  }
  await purgeReservedTicketsForSale(sale);
  return { sale, outbox };
}

/**
 * After a local/offline sale is queued, drop reserved tickets up to the printed Cash Sales #
 * so the on-device pool continues from the next number.
 */
async function purgeReservedTicketsForSale(sale) {
  if (sale?.pos_order_num == null) return;
  try {
    await purgeReservedPosTicketsUpTo(sale.pos_order_num, sale.pos_order_date);
  } catch {
    /* non-fatal — pool refill corrects gaps */
  }
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
  cashRound = false,
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
    cashRound,
  });
}

/**
 * Build a printable sale snapshot from the current previous-order edit cart
 * (no outbox write). Used by Alt+P while revising.
 */
export function buildPreviousOrderEditPrintSale(
  cart,
  { user = null, organization = null, sourceSale = null, productByCode = null } = {},
) {
  if (!cart?.held_order_num) return null;
  const summary = summarizeLocalPosCart(cart);
  const orderNum = Number(cart.held_order_num);
  const posOrderNum =
    cart.pos_order_num != null
      ? Number(cart.pos_order_num)
      : sourceSale?.pos_order_num != null
        ? Number(sourceSale.pos_order_num)
        : null;
  const posOrderDate =
    cart.pos_order_date ??
    (sourceSale?.pos_order_date ? String(sourceSale.pos_order_date).slice(0, 10) : null);
  const items = (cart.lines ?? [])
    .filter((line) => Number(line.quantity ?? 0) > 0 && line.product_code)
    .map((line, index) => {
      const catalog = productByCode?.[line.product_code] ?? null;
      const unit =
        snapshotUomForPrint(line.unit) ??
        snapshotUomForPrint(line.product?.unit ?? line.product?.uom) ??
        snapshotUomForPrint(catalog?.uom ?? catalog?.unit) ??
        null;
      const unitId =
        line.unit_id ??
        line.product?.unit_id ??
        catalog?.unit_id ??
        unit?.id ??
        null;
      const lineAmount =
        line.amount != null && Number.isFinite(Number(line.amount))
          ? Math.round(Number(line.amount) * 100) / 100
          : Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100;
      const isRetail = Number(line.on_wholesale_retail ?? 0) === 1;
      return {
        id: line.id ?? index + 1,
        product_code: line.product_code,
        product_name:
          line.product_name ??
          catalog?.product_name ??
          line.description ??
          line.product_code,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price ?? 0),
        display_unit_price:
          line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
        amount: lineAmount,
        uom: line.uom ?? null,
        unit,
        unit_id: unitId,
        // Number()===1 — Boolean("0") is true and wrongly printed as retail kg.
        on_wholesale_retail: isRetail,
        discount_given: Number(line.discount_given ?? 0),
        product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
        product: {
          product_code: line.product_code,
          product_name:
            line.product_name ?? catalog?.product_name ?? line.product_code,
          unit,
          unit_id: unitId,
        },
      };
    });
  const adjustments = Array.isArray(cart.payment_adjustments)
    ? cart.payment_adjustments.filter((row) => Number(row?.amount) > 0)
    : [];
  const returnGivenPreview = adjustments
    .filter((row) => row.adjustment_type === "return")
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  // Empty cart is a cancel print only when the full return was recorded.
  if (!items.length && !(returnGivenPreview > 0.0001)) return null;

  const isEmptyCancel = !items.length && returnGivenPreview > 0.0001;
  const revisedTotal = isEmptyCancel ? 0 : summary.total;
  const snapshot =
    cart.offline_edit_snapshot && typeof cart.offline_edit_snapshot === "object"
      ? cart.offline_edit_snapshot
      : null;
  const effectiveSource = {
    ...(snapshot ?? {}),
    ...(sourceSale && typeof sourceSale === "object" ? sourceSale : {}),
    order_total:
      Number(
        sourceSale?.order_total ??
          cart.original_order_total ??
          snapshot?.order_total ??
          sourceSale?.amount_paid ??
          snapshot?.amount_paid ??
          0,
      ) || 0,
    ...(Number(cart.original_order_total) > 0
      ? { original_order_total: Number(cart.original_order_total) }
      : {}),
  };
  const tenders = rebuildPreviousOrderEditTenders(
    effectiveSource,
    adjustments,
    revisedTotal,
  );
  const {
    cash,
    mpesa: mpesaAmount,
    equity: equityAmount,
    kcb: kcbAmount,
    returnGiven,
    topupAmount,
  } = tenders;
  const reconciledAdjustments = Array.isArray(tenders.adjustments)
    ? tenders.adjustments
    : adjustments;

  const paymentMethodCode = (() => {
    if (
      mpesaAmount >= cash &&
      mpesaAmount >= equityAmount &&
      mpesaAmount >= kcbAmount &&
      mpesaAmount > 0
    ) {
      return "MPESA";
    }
    if (equityAmount >= cash && equityAmount >= kcbAmount && equityAmount > 0) return "EQUITY";
    if (kcbAmount >= cash && kcbAmount > 0) return "KCB";
    if (cash > 0) return "CASH";
    return (
      String(cart.payment_method_code ?? sourceSale?.payment_method_code ?? "CASH")
        .trim()
        .toUpperCase() || "CASH"
    );
  })();

  const receiptAt =
    sourceSale?.completed_at ??
    sourceSale?.created_at ??
    sourceSale?.placed_at ??
    cart.updated_at ??
    new Date().toISOString();
  const parsedReceiptAt = Date.parse(receiptAt);
  const receiptAtMs = Number(
    sourceSale?.created_at_ms ??
      sourceSale?.offline_sold_at_ms ??
      (Number.isFinite(parsedReceiptAt) ? parsedReceiptAt : Date.now()),
  );

  const amountPaid = isEmptyCancel ? 0 : tenders.amountPaid;
  const isCreditPrint = Boolean(
    cart.is_credit_sale ??
      sourceSale?.is_credit_sale ??
      snapshot?.is_credit_sale,
  ) ||
    String(cart.payment_method_code ?? sourceSale?.payment_method_code ?? "")
      .trim()
      .toUpperCase() === "CREDIT";
  const printPaymentStatus = (() => {
    if (isEmptyCancel) return "refunded";
    if (!isCreditPrint) return "paid";
    if (amountPaid + 0.01 >= revisedTotal && revisedTotal > 0) return "paid";
    if (amountPaid > 0.01) return "partial";
    return "unpaid";
  })();
  const printWorkflowStatus = isEmptyCancel
    ? "cancelled"
    : printPaymentStatus === "paid"
      ? "paid"
      : printPaymentStatus === "partial"
        ? "pending_payment"
        : "unpaid";

  return {
    id: cart.server_sale_id ?? sourceSale?.id ?? `edit:${orderNum}`,
    order_num: orderNum,
    ...(posOrderNum != null ? { pos_order_num: posOrderNum } : {}),
    ...(posOrderDate ? { pos_order_date: posOrderDate } : {}),
    created_at: receiptAt,
    completed_at: receiptAt,
    created_at_ms: Number.isFinite(receiptAtMs) && receiptAtMs > 0 ? receiptAtMs : Date.now(),
    organization_id: organization?.id ?? user?.organization_id ?? null,
    branch_id: cart.branch_id ?? user?.branch_id ?? null,
    channel: "pos",
    order_source: "pos",
    status: printWorkflowStatus,
    payment_status: printPaymentStatus,
    payment_method_code: paymentMethodCode,
    is_credit_sale: isCreditPrint,
    order_total: revisedTotal,
    total_vat: isEmptyCancel ? 0 : summary.vat,
    amount_paid: amountPaid,
    cash,
    mpesa_amount: mpesaAmount,
    equity_amount: equityAmount,
    kcb_amount: kcbAmount,
    customer_num: cart.customer_num ?? sourceSale?.customer_num ?? null,
    customer_name_override:
      cart.customer_name_override ?? sourceSale?.customer_name_override ?? null,
    superseded_sale_id: cart.superseded_sale_id ?? null,
    payment_adjustments: reconciledAdjustments,
    ...(returnGiven > 0.0001 ? { _change_given: returnGiven, order_change: returnGiven } : {}),
    ...(topupAmount > 0.0001 ? { _topup_amount: topupAmount } : {}),
    // Draft reprint — never block on eTIMS / never GET pre-edit sale (old lines + tenders).
    _skip_kra_qr: true,
    offline_pending_sync: true,
    _preserve_print_items: true,
    items,
    // One row per tender — never a single amountPaid lump (that doubled M-Pesa on print).
    payments: paymentRowsFromPreviousOrderEditTenders({
      cash,
      mpesa: mpesaAmount,
      equity: equityAmount,
      kcb: kcbAmount,
    }),
    created_by_user: sourceSale?.created_by_user ?? sourceSale?.cashier ?? null,
    cashier: sourceSale?.cashier ?? null,
    cashier_name: sourceSale?.cashier_name ?? null,
  };
}

function mapOutboxLinesForPut(row) {
  const lines =
    Array.isArray(row.lines) && row.lines.length > 0
      ? row.lines
      : Array.isArray(row.sale_payload?.items) && row.sale_payload.items.length > 0
        ? row.sale_payload.items
        : // Recover rows corrupted by an old abandonOfflineSaleEdit bug (sale
          // snapshot written over the outbox record — items live at the top level).
          Array.isArray(row.items) && row.items.length > 0
          ? row.items
          : [];
  return lines.map((line) => buildOutboxLineBody(line));
}

/** True when a previous-order edit outbox has no lines — sync must cancel online. */
export function isPreviousOrderEditEmptyCancel(row) {
  if (!row || row.sync_kind !== "previous_order_edit") return false;
  if (String(row.sale_payload?.status ?? row.checkout_body?.status ?? "")
    .trim()
    .toLowerCase() === "cancelled") {
    return true;
  }
  return mapOutboxLinesForPut(row).length === 0;
}

/**
 * Empty previous-order edit: cancel the live sale online.
 * PUT /carts/{id}/lines rejects an empty `lines` array ("The lines field is required").
 */
async function cancelPreviousOrderEditOutboxRow(row, orderNum) {
  const saleId = await findLiveSaleIdForPreviousOrderEdit(row);
  if (!saleId) {
    throw new Error("Missing sale for empty previous-order cancel.");
  }

  try {
    const existing = await apiRequest(`/sales/${saleId}`, {
      loading: false,
      reportIssues: false,
    });
    if (String(existing?.status ?? "").toLowerCase() === "cancelled") {
      return existing;
    }
  } catch {
    /* continue — transition will surface a real missing-sale error */
  }

  // Match Sales & Orders cancel — status only (extra fields can 422 on transition).
  const cancelled = await apiRequest(`/sales/orders/${saleId}/transition`, {
    method: "POST",
    body: { status: "cancelled" },
    loading: false,
    reportIssues: false,
  });

  // Drop any TemporaryCart left from the edit session so F8 / next restore stays clean.
  const cartId = row.server_cart_id ? Number(row.server_cart_id) : null;
  if (cartId) {
    void apiRequest(`/sales/carts/${cartId}/lines`, {
      method: "DELETE",
      loading: false,
      reportIssues: false,
    }).catch(() => {});
  }

  return cancelled ?? { id: saleId, order_num: orderNum, status: "cancelled", payment_status: "refunded" };
}

function buildOutboxLineBody(line) {
  const qty = Math.max(0.0001, Number(line.quantity) || 0);
  const unitPrice = Number(line.unit_price ?? 0);
  const unit =
    line.unit && typeof line.unit === "object"
      ? snapshotUomForPrint(line.unit)
      : null;
  return {
    product_code: line.product_code,
    quantity: qty,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    display_unit_price:
      line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
    uom: line.uom ?? undefined,
    unit_id: line.unit_id ?? unit?.id ?? undefined,
    // Snapshot so sync/sale display can show packs (5 bag) not base (350 bag).
    ...(unit ? { unit } : {}),
    on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) ? 1 : 0,
    discount_given: Number(line.discount_given ?? 0) || 0,
    product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
    // Frozen offline total — server must not reprice / recreate from catalogue.
    amount: line.amount != null ? Number(line.amount) : undefined,
    product_name: line.product_name ?? undefined,
  };
}

/**
 * Sync a previous-order edit: PUT lines onto the edit cart (or restore-to-cart), then checkout
 * with the same order number so the server record is updated.
 */
async function findLiveSaleIdForPreviousOrderEdit(row) {
  const orderNum = Number(row.order_num ?? 0);
  const supersededId = Number(row.superseded_sale_id ?? row.server_sale_id ?? 0) || null;
  if (!orderNum && !supersededId) return null;

  // Prefer the known superseded id when it is still a live (editable) sale.
  if (supersededId) {
    try {
      const sale = await apiRequest(`/sales/${supersededId}`, {
        loading: false,
        reportIssues: false,
      });
      const status = String(sale?.status ?? "").toLowerCase();
      if (
        sale?.id
        && !["cancelled", "held", "draft"].includes(status)
        && (orderNum <= 0 || Number(sale.order_num) === orderNum)
      ) {
        return Number(sale.id);
      }
    } catch {
      /* fall through to order # lookup */
    }
  }

  if (!orderNum) return supersededId;

  try {
    const res = await apiRequest("/sales", {
      searchParams: {
        q: String(orderNum),
        per_page: 30,
        channel: "pos",
        order_source: "pos",
      },
      loading: false,
      reportIssues: false,
    });
    const rows = Array.isArray(res?.data) ? res.data : [];
    const live = rows.find((sale) => {
      if (Number(sale?.order_num) !== orderNum) return false;
      const status = String(sale?.status ?? "").toLowerCase();
      return !["cancelled", "held", "draft"].includes(status);
    });
    if (live?.id) return Number(live.id);
  } catch {
    /* ignore */
  }

  return supersededId;
}

async function resolvePreviousOrderEditCartId(row) {
  let cartId = row.server_cart_id ? Number(row.server_cart_id) : null;

  async function restoreFromSale(saleId) {
    if (!saleId) return null;
    const restored = await apiRequest(`/sales/orders/${saleId}/restore-to-cart`, {
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

  const liveSaleId = await findLiveSaleIdForPreviousOrderEdit(row);
  return restoreFromSale(liveSaleId);
}

async function checkoutBodyForOutboxRow(row, orderNum, extras = {}) {
  const posDate =
    normalizePosOrderDate(extras.pos_order_date) ??
    normalizePosOrderDate(row.checkout_body?.pos_order_date) ??
    normalizePosOrderDate(row.sale_payload?.pos_order_date);
  const posNumRaw =
    extras.pos_order_num ??
    row.checkout_body?.pos_order_num ??
    row.sale_payload?.pos_order_num;
  const posNum = posNumRaw != null ? Number(posNumRaw) : null;

  const customerNumRaw =
    extras.customer_num ??
    row.checkout_body?.customer_num ??
    row.sale_payload?.customer_num ??
    null;
  const customerNum =
    customerNumRaw != null && Number(customerNumRaw) > 0 ? Number(customerNumRaw) : null;
  const customerNameOverride =
    String(extras.customer_name_override ?? "").trim() ||
    String(row.checkout_body?.customer_name_override ?? "").trim() ||
    String(row.sale_payload?.customer_name_override ?? "").trim() ||
    null;

  const body = {
    ...row.checkout_body,
    offline_order: true,
    client_sale_uuid: row.client_sale_uuid,
  };
  const deferOrgOrderNum = Boolean(
    row.defer_org_order_num ?? row.checkout_body?.defer_org_order_num,
  );
  // New offline sales: let the server allocate organization order_num on sync.
  // Cash Sales # (pos_order_num) is the till ticket printed on the receipt.
  if (deferOrgOrderNum || !(Number(orderNum) > 0)) {
    delete body.order_num;
    delete body.defer_org_order_num;
  } else {
    body.order_num = orderNum;
  }
  // Always stamp content_revision for offline uploads so uuid:revision idempotency
  // matches the latest queued payload (edits before sync are not frozen at rev 1).
  const revision =
    row.content_revision != null
      ? Number(row.content_revision)
      : body.content_revision != null
        ? Number(body.content_revision)
        : null;
  if (revision != null && Number.isFinite(revision)) {
    body.content_revision = revision;
  }
  if (extras.clear_pos_order_num) {
    delete body.pos_order_num;
  } else if (posNum != null && posNum > 0) {
    body.pos_order_num = posNum;
  }
  if (posDate) {
    body.pos_order_date = clampPosOrderBusinessDate(posDate);
  } else {
    delete body.pos_order_date;
  }
  const clientCompleted =
    extras.client_completed_at ??
    row.checkout_body?.client_completed_at ??
    row.sale_payload?.completed_at ??
    row.sale_payload?.created_at ??
    (row.created_at_ms ? new Date(row.created_at_ms).toISOString() : null);
  if (clientCompleted) {
    body.client_completed_at = clientCompleted;
  } else {
    delete body.client_completed_at;
  }
  if (customerNum != null) {
    body.customer_num = customerNum;
  }
  if (customerNameOverride) {
    body.customer_name_override = customerNameOverride;
  }
  const customerKraPin =
    String(extras.customer_kra_pin ?? "").trim() ||
    String(row.checkout_body?.customer_kra_pin ?? "").trim() ||
    "";
  if (customerKraPin) {
    body.customer_kra_pin = customerKraPin;
  }
  // Offline outbox sync uploads the sale only — never fiscalize (receipt already printed).
  body.submit_kra = false;
  body.offline_order = true;
  // After Z/reopen, attach the currently open float session so checkout does not
  // reject the closed session id stamped when the sale was sold offline.
  const openFloatSessionId = Number(extras.float_session_id ?? 0);
  if (Number.isFinite(openFloatSessionId) && openFloatSessionId > 0) {
    body.float_session_id = openFloatSessionId;
  }

  // Repair stuck previous-order edits: CREDIT method without credit flag.
  // Only re-enable credit when the prior sale was actually a credit sale.
  const methodCode = String(body.payment_method_code ?? "").trim().toUpperCase();
  const priorCredit = Boolean(
    row.sale_payload?.is_credit_sale ??
      row.prior_sale_snapshot?.is_credit_sale ??
      row.checkout_body?.is_credit_sale,
  );
  if (row.sync_kind === "previous_order_edit") {
    if (priorCredit) {
      body.is_credit_sale = true;
      if (!body.payment_method_code) {
        body.payment_method_code = "CREDIT";
      }
    } else if (methodCode === "CREDIT") {
      // Non-credit revise accidentally kept CREDIT — settle as cash full pay.
      body.is_credit_sale = false;
      body.payment_method_code = "CASH";
    }
  }

  return body;
}

async function checkoutPreviousOrderEditOutboxRow(row, orderNum) {
  // Cleared receipt → cancel online. Never PUT an empty lines array (API rejects it).
  if (isPreviousOrderEditEmptyCancel(row)) {
    return cancelPreviousOrderEditOutboxRow(row, orderNum);
  }

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
  // Heal rows corrupted by an old abandonOfflineSaleEdit bug before upload.
  const recovered = mapOutboxLinesForPut(row);
  if (
    recovered.length > 0 &&
    (!Array.isArray(row.lines) || row.lines.length === 0 || !row.sale_payload?.items?.length)
  ) {
    const healed = {
      ...row,
      lines: recovered.map((line) => ({
        product_code: line.product_code,
        quantity: line.quantity,
        unit_price: line.unit_price,
        display_unit_price: line.display_unit_price,
        uom: line.uom,
        unit_id: line.unit_id ?? null,
        unit: line.unit ?? null,
        on_wholesale_retail: line.on_wholesale_retail,
        discount_given: line.discount_given,
        product_name: line.product_name,
        product_vat: line.product_vat,
        amount: line.amount,
      })),
      sale_payload: {
        ...(row.sale_payload && typeof row.sale_payload === "object" ? row.sale_payload : {}),
        ...(Array.isArray(row.items) ? row : {}),
        client_sale_uuid: row.client_sale_uuid,
        items:
          Array.isArray(row.sale_payload?.items) && row.sale_payload.items.length
            ? row.sale_payload.items
            : Array.isArray(row.items) && row.items.length
              ? row.items
              : recovered,
      },
      updated_at_ms: Date.now(),
    };
    try {
      await idbPutOutboxSale(healed);
    } catch {
      /* upload still uses healed in-memory */
    }
    row = healed;
  }

  if (row.sync_kind === "previous_order_edit") {
    return checkoutPreviousOrderEditOutboxRow(row, orderNum);
  }

  // Prefer the currently open float session when syncing after Z/reopen so the
  // closed session id from the original offline sale does not block checkout.
  const openFloatSessionId =
    Number(extras.float_session_id ?? 0) > 0
      ? Number(extras.float_session_id)
      : null;
  const cartSeed = {
    channel: "pos",
    branch_id: row.cart_seed?.branch_id ?? undefined,
    till_id: row.cart_seed?.till_id ?? undefined,
    ...(openFloatSessionId
      ? { float_session_id: openFloatSessionId }
      : row.cart_seed?.float_session_id
        ? { float_session_id: row.cart_seed.float_session_id }
        : {}),
  };

  const cart = await apiRequest("/sales/carts", {
    method: "POST",
    body: cartSeed,
    loading: false,
    reportIssues: false,
  });
  const cartId = cart?.id;
  if (!cartId) throw new Error("Could not create sync cart.");

  // Sticky TemporaryCart is reused per cashier+channel — REPLACE lines so leftover
  // draft/online lines are not appended onto the offline snapshot (extra items / qty blow-up).
  const orderDiscount = Number(row.order_discount ?? 0);
  await apiRequest(`/sales/carts/${cartId}/lines`, {
    method: "PUT",
    body: {
      lines: mapOutboxLinesForPut(row),
      order_discount: orderDiscount > 0 ? orderDiscount : 0,
    },
    loading: false,
    reportIssues: false,
  });

  return apiRequest(`/sales/carts/${cartId}/checkout`, {
    method: "POST",
    body: await checkoutBodyForOutboxRow(row, orderNum, {
      ...extras,
      ...(openFloatSessionId ? { float_session_id: openFloatSessionId } : {}),
    }),
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
      const posOrderNum =
        sale.pos_order_num != null && Number(sale.pos_order_num) > 0
          ? Number(sale.pos_order_num)
          : null;
      return {
        ...sale,
        id: `offline:${row.client_sale_uuid}`,
        order_num: row.order_num,
        pos_order_num: posOrderNum,
        pos_order_date: sale.pos_order_date ?? null,
        status: sale.status ?? "completed",
        offline_pending_sync: true,
      };
    })
    .sort(
      (a, b) =>
        Number(b.pos_order_num ?? 0) - Number(a.pos_order_num ?? 0) ||
        Number(b.order_num ?? 0) - Number(a.order_num ?? 0),
    );
}

/**
 * Local mirrors of recently synced POS sales (still in IndexedDB — never deleted on sync).
 * Uses the server sale id so ← / Cash Sales # reopen the live order.
 */
export async function listLocalSyncedSalesForBrowse() {
  const synced = await idbListSyncedOutboxForBrowse();
  return synced
    .map((row) => {
      const sale = row.sale_payload && typeof row.sale_payload === "object" ? row.sale_payload : {};
      const serverId = Number(row.server_sale_id ?? sale.id ?? 0);
      if (!(serverId > 0)) return null;
      const posOrderNum =
        sale.pos_order_num != null && Number(sale.pos_order_num) > 0
          ? Number(sale.pos_order_num)
          : row.checkout_body?.pos_order_num != null
            ? Number(row.checkout_body.pos_order_num)
            : null;
      return {
        ...sale,
        id: serverId,
        order_num: Number(row.server_order_num ?? sale.order_num ?? row.order_num ?? 0) || null,
        pos_order_num: posOrderNum,
        pos_order_date: sale.pos_order_date ?? row.checkout_body?.pos_order_date ?? null,
        float_session_id:
          sale.float_session_id ??
          row.checkout_body?.float_session_id ??
          row.cart_seed?.float_session_id ??
          null,
        status: sale.status ?? "paid",
        offline_pending_sync: false,
        offline_client_uuid: String(row.client_sale_uuid || "").trim() || null,
        _local_synced_mirror: true,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        Number(b.pos_order_num ?? 0) - Number(a.pos_order_num ?? 0) ||
        Number(b.order_num ?? 0) - Number(a.order_num ?? 0),
    );
}

/**
 * Full local sale snapshot (with line items) for editing a previous receipt while offline.
 * Returns null when the till has no cached lines for that server sale / Cash Sales #.
 */
export async function findLocalSyncedSaleForOfflineEdit({
  saleId = null,
  ticketNum = null,
} = {}) {
  const rows = await idbListSyncedOutboxForBrowse({
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    limit: 100,
  });
  const ticket = ticketNum != null ? Number(ticketNum) : null;
  const targetId = saleId != null ? Number(saleId) : null;

  const row =
    (targetId > 0
      ? rows.find((r) => Number(r.server_sale_id ?? 0) === targetId)
      : null) ??
    (Number.isFinite(ticket) && ticket > 0
      ? rows.find((r) => {
          const pos =
            r.sale_payload?.pos_order_num ??
            r.checkout_body?.pos_order_num ??
            null;
          return pos != null && Number(pos) === ticket;
        })
      : null);

  if (!row) return null;

  const sale = row.sale_payload && typeof row.sale_payload === "object" ? row.sale_payload : {};
  const serverId = Number(row.server_sale_id ?? sale.id ?? 0);
  if (!(serverId > 0)) return null;

  const items = Array.isArray(row.lines) && row.lines.length
    ? row.lines
    : Array.isArray(sale.items)
      ? sale.items
      : [];
  if (!items.length) return null;

  return {
    ...sale,
    id: serverId,
    order_num: Number(row.server_order_num ?? sale.order_num ?? row.order_num ?? 0) || null,
    pos_order_num:
      sale.pos_order_num != null && Number(sale.pos_order_num) > 0
        ? Number(sale.pos_order_num)
        : row.checkout_body?.pos_order_num != null
          ? Number(row.checkout_body.pos_order_num)
          : null,
    pos_order_date: sale.pos_order_date ?? row.checkout_body?.pos_order_date ?? null,
    float_session_id:
      sale.float_session_id ??
      row.checkout_body?.float_session_id ??
      row.cart_seed?.float_session_id ??
      null,
    status: sale.status ?? "paid",
    items,
    _local_synced_mirror: true,
  };
}

/** Stable IndexedDB key for online POS sales mirrored for offline previous-order edit. */
export function onlineSaleMirrorClientUuid(serverSaleId) {
  const id = Number(serverSaleId);
  if (!(id > 0)) return null;
  return `online-mirror-${id}`;
}

/**
 * Keep a completed server POS sale on-device (synced outbox mirror) so previous-order
 * edit works offline — same path as sales that were written while offline then uploaded.
 * Safe no-op when items are missing or the row is mid-upload.
 */
export async function cacheServerSaleForOfflineEdit(sale) {
  if (!sale || typeof sale !== "object") return false;
  const serverId = Number(sale.id ?? 0);
  if (!(serverId > 0)) return false;
  if (String(sale.id).startsWith("offline:")) return false;

  const items = Array.isArray(sale.items)
    ? sale.items.filter((row) => row?.product_code && Number(row.quantity ?? 0) > 0)
    : [];
  if (!items.length) return false;

  const uuid = onlineSaleMirrorClientUuid(serverId);
  if (!uuid) return false;

  try {
    const existing = await idbGetOutboxSale(uuid);
    const status = String(existing?.sync_status ?? "");
    // Never clobber a live upload/edit queue (should not happen for online-mirror-* keys).
    if (status === "pending" || status === "syncing" || status === "editing") {
      return false;
    }

    const lines = items.map((item) => ({
      product_code: item.product_code,
      product_name: item.product_name ?? item.description ?? item.product_code,
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? item.selling_price ?? item.price ?? 0),
      display_unit_price:
        item.display_unit_price != null ? Number(item.display_unit_price) : undefined,
      amount: item.amount != null ? Number(item.amount) : undefined,
      uom: item.uom ?? null,
      unit_id: item.unit_id ?? item.product?.unit_id ?? null,
      unit: item.unit ?? item.product?.unit ?? item.product?.uom ?? null,
      on_wholesale_retail: Number(item.on_wholesale_retail ?? 0) === 1 ? 1 : 0,
      discount_given: Number(item.discount_given ?? 0),
      product_vat: item.product_vat != null ? Number(item.product_vat) : undefined,
    }));

    const payload = {
      ...sale,
      id: serverId,
      offline_pending_sync: false,
      items: lines,
    };

    await idbPutOutboxSale({
      ...(existing && typeof existing === "object" ? existing : {}),
      client_sale_uuid: uuid,
      sync_status: "synced",
      sync_kind: "online_mirror",
      sync_error: null,
      sync_started_at_ms: null,
      revision_at_sync: null,
      server_sale_id: serverId,
      server_order_num: Number(sale.order_num ?? existing?.server_order_num ?? 0) || null,
      order_num: Number(sale.order_num ?? existing?.order_num ?? 0) || serverId,
      created_at_ms: existing?.created_at_ms ?? Date.now(),
      updated_at_ms: Date.now(),
      synced_at_ms: Date.now(),
      sale_payload: payload,
      prior_sale_snapshot: payload,
      checkout_body: {
        ...(existing?.checkout_body && typeof existing.checkout_body === "object"
          ? existing.checkout_body
          : {}),
        pos_order_num: sale.pos_order_num ?? null,
        pos_order_date: sale.pos_order_date ?? null,
        float_session_id: sale.float_session_id ?? null,
        payment_method_code: sale.payment_method_code ?? null,
      },
      cart_seed: {
        branch_id: sale.branch_id ?? existing?.cart_seed?.branch_id ?? null,
        float_session_id:
          sale.float_session_id ?? existing?.cart_seed?.float_session_id ?? null,
        channel: "pos",
      },
      lines,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * While online, backfill recent server POS receipts into the offline edit cache
 * so a later outage can still reopen them.
 */
export async function prefetchServerSalesForOfflineEdit(
  serverOrders,
  { fetchSale, limit = 15 } = {},
) {
  if (typeof fetchSale !== "function") return 0;
  const rows = Array.isArray(serverOrders) ? serverOrders : [];
  let cached = 0;
  for (const row of rows.slice(0, Math.max(0, Number(limit) || 15))) {
    const saleId = Number(row?.id ?? 0);
    if (!(saleId > 0)) continue;
    try {
      const existing = await findLocalSyncedSaleForOfflineEdit({ saleId });
      if (existing?.items?.length) continue;
      const sale = await fetchSale(saleId);
      if (await cacheServerSaleForOfflineEdit(sale)) cached += 1;
    } catch {
      /* skip individual failures */
    }
  }
  return cached;
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
  if (row.sync_status === "syncing") {
    throw new Error(
      "That sale is uploading now. Wait for sync to finish, then edit if it is still pending.",
    );
  }

  // Prefer a real outbox shape. Older abandonOfflineSaleEdit bugs overwrote the
  // row with a bare sale_payload (items at top level, no nested sale_payload).
  const saleFromPayload =
    row.sale_payload && typeof row.sale_payload === "object" ? row.sale_payload : null;
  const saleLooksEmbedded =
    !saleFromPayload &&
    (Array.isArray(row.items) || row.product_code || row.client_sale_uuid);
  const sale = saleFromPayload ?? (saleLooksEmbedded ? row : {});
  const lines = (row.lines?.length
    ? row.lines
    : Array.isArray(sale.items)
      ? sale.items
      : Array.isArray(row.items)
        ? row.items
        : []
  ).map((line) => {
    const clientLineId = line.client_line_id ?? newClientSaleUuid();
    return {
      ...line,
      client_line_id: clientLineId,
      product_code: line.product_code,
      product_name: line.product_name ?? line.description ?? line.product_code,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price ?? line.selling_price ?? line.price ?? 0),
      uom: line.uom ?? null,
      on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) === 1,
      discount_given: Number(line.discount_given ?? 0),
    };
  });

  if (!lines.length) {
    throw new Error(
      "That offline sale has no line items stored on this till. Reconnect and sync, or recreate the sale.",
    );
  }

  // Self-heal corrupted outbox rows so a later sync / abandon keeps line items.
  const repairedOutbox =
    !row.sale_payload || !Array.isArray(row.lines) || row.lines.length === 0
      ? {
          ...row,
          client_sale_uuid: row.client_sale_uuid ?? uuid,
          order_num: Number(row.order_num ?? sale.order_num ?? 0) || null,
          sale_payload: {
            ...(saleFromPayload ?? {}),
            ...sale,
            id: sale.id ?? `offline:${uuid}`,
            client_sale_uuid: uuid,
            items: lines.map((line, index) => ({
              id: line.id ?? index + 1,
              product_code: line.product_code,
              product_name: line.product_name,
              quantity: Number(line.quantity),
              unit_price: Number(line.unit_price),
              amount: line.amount != null ? Number(line.amount) : undefined,
              uom: line.uom ?? null,
              unit_id: line.unit_id ?? null,
              unit: line.unit ?? null,
              on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) === 1,
              discount_given: Number(line.discount_given ?? 0),
              display_unit_price:
                line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
              product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
            })),
          },
          lines: lines.map((line) => ({
            product_code: line.product_code,
            product_name: line.product_name,
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price),
            amount: line.amount != null ? Number(line.amount) : undefined,
            uom: line.uom ?? null,
            unit_id: line.unit_id ?? null,
            unit: line.unit ?? null,
            on_wholesale_retail: Number(line.on_wholesale_retail ?? 0) === 1 ? 1 : 0,
            discount_given: Number(line.discount_given ?? 0),
            display_unit_price:
              line.display_unit_price != null ? Number(line.display_unit_price) : undefined,
            product_vat: line.product_vat != null ? Number(line.product_vat) : undefined,
            client_line_id: line.client_line_id,
          })),
          sync_status: "editing",
          updated_at_ms: Date.now(),
        }
      : { ...row, sync_status: "editing", updated_at_ms: Date.now() };

  const localCart = {
    id: "active",
    offline: true,
    channel: "pos",
    held_order_num: Number(repairedOutbox.order_num ?? sale.order_num),
    ...(sale.pos_order_num != null && Number(sale.pos_order_num) > 0
      ? { pos_order_num: Number(sale.pos_order_num) }
      : {}),
    ...(sale.pos_order_date ? { pos_order_date: sale.pos_order_date } : {}),
    superseded_sale_id:
      repairedOutbox.sync_kind === "previous_order_edit"
        ? Number(repairedOutbox.superseded_sale_id ?? repairedOutbox.server_sale_id ?? 0) || null
        : null,
    offline_client_sale_uuid: uuid,
    // Original sale tenders only — never the rebuilt outbox sale_payload (would 2× M-Pesa).
    offline_edit_snapshot:
      repairedOutbox.prior_sale_snapshot && typeof repairedOutbox.prior_sale_snapshot === "object"
        ? repairedOutbox.prior_sale_snapshot
        : repairedOutbox.sync_kind === "previous_order_edit"
          ? null
          : repairedOutbox.sale_payload,
    original_order_total: (() => {
      const prior =
        repairedOutbox.prior_sale_snapshot && typeof repairedOutbox.prior_sale_snapshot === "object"
          ? repairedOutbox.prior_sale_snapshot
          : null;
      const total = Number(
        prior?.order_total ?? sale.original_order_total ?? sale.order_total ?? 0,
      );
      return total > 0 ? Math.round(total * 100) / 100 : null;
    })(),
    branch_id: repairedOutbox.cart_seed?.branch_id ?? sale.branch_id ?? seed.branch_id ?? null,
    till_id: repairedOutbox.cart_seed?.till_id ?? sale.till_id ?? seed.till_id ?? null,
    float_session_id:
      repairedOutbox.cart_seed?.float_session_id ??
      sale.float_session_id ??
      seed.float_session_id ??
      null,
    customer_num: sale.customer_num ?? null,
    customer_name_override: sale.customer_name_override ?? null,
    lines,
    updated_at_ms: Date.now(),
  };

  await idbPutOutboxSale(repairedOutbox);
  await idbPutLocalCart(localCart);
  return {
    cart: localCart,
    sale: {
      ...repairedOutbox.sale_payload,
      id: `offline:${uuid}`,
      order_num: repairedOutbox.order_num,
    },
  };
}

/**
 * Put a mid-edit offline sale back on the sync queue without applying cart changes.
 * Never overwrite the outbox row with a bare sale_payload snapshot — that wiped
 * `lines` / `sale_payload` and made sync fail with empty line validation.
 */
export async function abandonOfflineSaleEdit(cart) {
  const uuid =
    (cart?.offline_client_sale_uuid != null && String(cart.offline_client_sale_uuid).trim()) ||
    (cart?.offline_edit_snapshot?.client_sale_uuid != null &&
      String(cart.offline_edit_snapshot.client_sale_uuid).trim()) ||
    null;
  if (uuid) {
    const existing = await idbGetOutboxSale(uuid);
    if (existing) {
      // Keep the real outbox record; only flip status back to pending.
      // If a prior bug left items only on the top-level sale shape, rebuild lines.
      const recoveredLines = mapOutboxLinesForPut(existing);
      const next = {
        ...existing,
        sync_status: "pending",
        sync_started_at_ms: null,
        revision_at_sync: null,
        updated_at_ms: Date.now(),
      };
      if (
        recoveredLines.length > 0 &&
        (!Array.isArray(existing.lines) || existing.lines.length === 0)
      ) {
        next.lines = recoveredLines.map((line) => ({
          product_code: line.product_code,
          quantity: line.quantity,
          unit_price: line.unit_price,
          display_unit_price: line.display_unit_price,
          uom: line.uom,
          unit_id: line.unit_id ?? null,
          unit: line.unit ?? null,
          on_wholesale_retail: line.on_wholesale_retail,
          discount_given: line.discount_given,
          product_name: line.product_name,
          product_vat: line.product_vat,
          amount: line.amount,
        }));
      }
      if (
        recoveredLines.length > 0 &&
        (!existing.sale_payload ||
          !Array.isArray(existing.sale_payload.items) ||
          existing.sale_payload.items.length === 0)
      ) {
        const baseSale =
          existing.sale_payload && typeof existing.sale_payload === "object"
            ? existing.sale_payload
            : Array.isArray(existing.items)
              ? existing
              : {};
        next.sale_payload = {
          ...baseSale,
          client_sale_uuid: uuid,
          items: Array.isArray(baseSale.items) && baseSale.items.length
            ? baseSale.items
            : next.lines ?? recoveredLines,
        };
      }
      await idbPutOutboxSale(next);
    }
  }
  await clearLocalPosCart();
}

export async function getPosOfflinePendingCount() {
  return idbCountPendingOutbox();
}

/** Rows background flush may retry (excludes failed — those need manual Sync). */
export async function getPosOfflineAutoRetryCount() {
  return idbCountAutoRetryOutbox();
}

/** Failed outbox rows (sync_status error) — for reprint while retrying. */
export async function listFailedOutboxSales() {
  const rows = (await idbListPendingOutbox({ includeErrors: true })).filter(
    (row) => row.sync_status === "error",
  );
  return rows
    .map((row) => mapOutboxRowForDisplay(row))
    .sort((a, b) => Number(b.order_num ?? 0) - Number(a.order_num ?? 0));
}

function mapOutboxRowForDisplay(row) {
  const sale = row.sale_payload && typeof row.sale_payload === "object" ? row.sale_payload : {};
  const items = Array.isArray(row.lines) && row.lines.length ? row.lines : sale.items ?? [];
  const orderTotal =
    sale.order_total != null
      ? Number(sale.order_total)
      : items.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
  return {
    ...sale,
    client_sale_uuid: row.client_sale_uuid,
    id: `offline:${row.client_sale_uuid}`,
    order_num: row.order_num,
    pos_order_num: sale.pos_order_num ?? row.checkout_body?.pos_order_num ?? null,
    pos_order_date: sale.pos_order_date ?? row.checkout_body?.pos_order_date ?? null,
    customer_name: sale.customer_name ?? sale.customer_name_override ?? "Walk-in",
    order_total: orderTotal,
    offline_pending_sync: true,
    sync_status: row.sync_status,
    sync_error: row.sync_error ?? null,
    sync_kind: row.sync_kind ?? "sale",
    items,
    created_at: row.created_at_ms ? new Date(row.created_at_ms).toISOString() : sale.created_at ?? null,
  };
}

/** Pending + failed offline sales for the POS management overlay. */
export async function listPendingOutboxSalesForManage() {
  const rows = await idbListPendingOutbox();
  return rows
    .map((row) => mapOutboxRowForDisplay(row))
    .sort((a, b) => Number(b.order_num ?? 0) - Number(a.order_num ?? 0));
}

/**
 * Remove a queued offline sale from the local outbox (e.g. after a sync error).
 * Does not undo a sale that already reached the server — use only for stuck local rows.
 */
export async function discardOutboxSale(clientSaleUuid) {
  const uuid = String(clientSaleUuid ?? "").trim();
  if (!uuid) {
    throw new Error("Missing offline sale id.");
  }
  const floatSessionId = await withPosOfflineExclusiveLock(async () => {
    const existing = await idbGetOutboxSale(uuid);
    if (!existing) {
      return { missing: true };
    }
    if (existing.sync_status === "syncing") {
      throw new Error("Cannot remove this sale while sync is in progress. Wait a moment and try again.");
    }
    await idbDeleteOutboxSale(uuid);
    const local = await idbGetLocalCart("active");
    if (local?.offline_client_sale_uuid === uuid) {
      await idbClearLocalCart("active");
    }
    // Cancelled/discarded Cash Sales # stays consumed — next local ticket is N+1.
    const discardedPos = Number(
      existing.sale_payload?.pos_order_num ?? existing.checkout_body?.pos_order_num ?? 0,
    );
    const discardedDate =
      normalizePosOrderDate(existing.sale_payload?.pos_order_date) ??
      normalizePosOrderDate(existing.checkout_body?.pos_order_date);
    if (Number.isFinite(discardedPos) && discardedPos > 0) {
      await seedLocalPosTicketSeq(discardedPos, discardedDate).catch(() => {});
    }
    return {
      floatSessionId:
        existing.sale_payload?.float_session_id ??
        existing.checkout_body?.float_session_id ??
        null,
    };
  });
  if (floatSessionId?.missing) {
    return false;
  }
  // Refresh reserved S00xx + Cash Sales sequence from server (includes cancelled max).
  // Outside the lock so discard cannot stall new offline checkouts.
  try {
    await ensurePosOfflineOrderNumbers({
      force: true,
      floatSessionId: floatSessionId?.floatSessionId ?? null,
    });
  } catch {
    /* ignore when offline */
  }
  return true;
}

/**
 * Remove every pending/failed offline sale from the local outbox.
 * Skips rows currently marked syncing. Does not undo server sales.
 *
 * @returns {Promise<{ deleted: number, skippedSyncing: number }>}
 */
export async function discardAllPendingOutboxSales() {
  return withPosOfflineExclusiveLock(async () => {
    const rows = await idbListPendingOutbox({ includeErrors: true });
    let deleted = 0;
    let skippedSyncing = 0;
    let maxPos = 0;
    let maxPosDate = null;
    const local = await idbGetLocalCart("active");
    const attachedUuid = local?.offline_client_sale_uuid
      ? String(local.offline_client_sale_uuid)
      : null;

    for (const row of rows) {
      if (row.sync_status === "syncing") {
        skippedSyncing += 1;
        continue;
      }
      const uuid = String(row.client_sale_uuid ?? "").trim();
      if (!uuid) continue;
      await idbDeleteOutboxSale(uuid);
      deleted += 1;
      const discardedPos = Number(
        row.sale_payload?.pos_order_num ?? row.checkout_body?.pos_order_num ?? 0,
      );
      if (Number.isFinite(discardedPos) && discardedPos > maxPos) {
        maxPos = discardedPos;
        maxPosDate =
          normalizePosOrderDate(row.sale_payload?.pos_order_date) ??
          normalizePosOrderDate(row.checkout_body?.pos_order_date);
      }
      if (attachedUuid && attachedUuid === uuid) {
        await idbClearLocalCart("active");
      }
    }

    if (maxPos > 0) {
      await seedLocalPosTicketSeq(maxPos, maxPosDate).catch(() => {});
    }

    return { deleted, skippedSyncing };
  });
}

/** True when the workspace cart still points at a failed/discarded/synced outbox row.
 * Failed sync must never own the live till — cashier continues on a fresh order.
 * Explicit `editing` (reopened from Pending sync) stays attached.
 */
export async function cartHasStaleFailedOutboxAttachment(cart) {
  const uuid = cart?.offline_client_sale_uuid;
  if (!uuid) return false;
  const row = await idbGetOutboxSale(uuid);
  if (!row) return true;
  if (row.sync_status === "editing") return false;
  if (row.sync_status === "error" || row.sync_status === "synced") return true;
  return false;
}

export async function getPosOfflineFailedCount() {
  const rows = await listFailedOutboxSales();
  return rows.length;
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

/** Cash Sales # (pos_order_num) collision — bump to next free ticket and retry upload. */
function isCashSalesTicketCollisionError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (/cash\s*sales/.test(msg) && /(already used|could not be claimed|already exists|could not allocate)/.test(msg)) {
    return true;
  }
  if (err instanceof ApiError) {
    const blob = JSON.stringify(err.body ?? {}).toLowerCase();
    if (/cash\s*sales/.test(blob) && /(already used|could not be claimed|already exists|could not allocate)/.test(blob)) {
      return true;
    }
  }
  return false;
}

/** Generic 500 "report to admin" wrapper — often hides Cash Sales / order # collision. */
function isOpaqueSalesServerError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (/an error occurred in sales/.test(msg) && /system administrator/.test(msg)) {
    return true;
  }
  if (err instanceof ApiError && err.status >= 500) {
    return true;
  }
  return false;
}

function outboxSyncErrorMessage(err) {
  if (err instanceof ApiError) {
    const formatted = formatApiErrorMessage(err.body, err.message);
    if (formatted && !/^server error$/i.test(formatted)) {
      return formatted;
    }
  }
  return err?.message ?? "Sync failed";
}


function outboxRowPosTicket(row) {
  const posNumRaw =
    row.checkout_body?.pos_order_num ??
    row.sale_payload?.pos_order_num ??
    null;
  const posNum = posNumRaw != null ? Number(posNumRaw) : null;
  const posDate = normalizePosOrderDate(
    row.checkout_body?.pos_order_date ?? row.sale_payload?.pos_order_date,
  );
  return {
    posNum: Number.isFinite(posNum) && posNum > 0 ? posNum : null,
    posDate,
  };
}

/**
 * Detect whether an outbox row already landed as this server sale (retry / timeout recovery).
 *
 * Must NOT treat the live sale being edited as “already synced” just because it shares
 * order_num / pos_order_num — that was skipping previous-order checkouts entirely.
 * Daily POS tickets also repeat across days, so ticket-only matches are unsafe.
 */
export function outboxRowMatchesServerSale(row, sale, orderNum) {
  if (!sale?.id) return false;

  const clientUuid = row.client_sale_uuid;
  const outboxRev = Number(row.content_revision ?? 0);
  const meta = sale.fulfillment_meta ?? {};
  const stampedRev = Number(meta.pos_content_revision ?? 0);
  const expectedSyncId =
    outboxRev > 0 || row.sync_kind === "previous_order_edit"
      ? `${clientUuid}:${outboxRev || 0}`
      : clientUuid;

  // Exact idempotency stamp from a prior successful checkout of this outbox payload.
  if (expectedSyncId && meta.pos_sync_id && String(meta.pos_sync_id) === String(expectedSyncId)) {
    return true;
  }

  // Previous-order edits supersede the live sale with the same ticket / org #.
  // Only the revision-specific pos_sync_id above counts as already synced.
  if (row.sync_kind === "previous_order_edit") {
    return false;
  }

  // New offline sales: recover when the sale carries our client uuid (even if list
  // search omitted pos_sync_id) — but only when the outbox is not a newer edit.
  const saleUuid =
    meta.client_sale_uuid ??
    meta.offline_client_sale_uuid ??
    sale.client_sale_uuid;
  if (clientUuid && saleUuid && String(saleUuid) === String(clientUuid)) {
    if (outboxRev > stampedRev) {
      // Cashier edited after an earlier upload attempt — must re-upload / supersede.
      return false;
    }
    return true;
  }

  // Last-resort recovery for legacy rows that still carried a reserved org order_num.
  // When defer_org_order_num is set, row.order_num is only the Cash Sales # label — never
  // match it against sales.order_num (that would collide with unrelated S#s).
  if (row.defer_org_order_num || row.checkout_body?.defer_org_order_num) {
    return false;
  }
  if (Number(sale.order_num) !== Number(orderNum)) {
    return false;
  }

  const { posNum, posDate } = outboxRowPosTicket(row);
  const salePosNum =
    sale.pos_order_num != null ? Number(sale.pos_order_num) : null;
  const salePosDate = normalizePosOrderDate(sale.pos_order_date);

  if (posNum != null) {
    if (salePosNum == null || posNum !== salePosNum) return false;
    if (!posDate || !salePosDate || posDate !== salePosDate) return false;
  }

  const rowTotal = row.sale_payload?.order_total ?? row.checkout_body?.pay_now;
  if (rowTotal == null) return false;
  const delta = Math.abs(Number(sale.order_total ?? 0) - Number(rowTotal));
  return delta < 0.02;
}

/** Same offline client uuid as this outbox row (any content revision). */
export function outboxRowSharesClientSaleUuid(row, sale) {
  if (!row?.client_sale_uuid || !sale?.id) return false;
  const meta = sale.fulfillment_meta ?? {};
  const saleUuid =
    meta.client_sale_uuid ??
    meta.offline_client_sale_uuid ??
    sale.client_sale_uuid;
  return Boolean(saleUuid && String(saleUuid) === String(row.client_sale_uuid));
}

/** True when a queued offline sale was edited after an older revision already reached the server. */
export function outboxNeedsSupersedeOfServerSale(row, sale) {
  if (!sale?.id || row?.sync_kind === "previous_order_edit") return false;
  if (outboxRowMatchesServerSale(row, sale, Number(row.order_num ?? sale.order_num))) {
    return false;
  }
  const outboxRev = Number(row.content_revision ?? 0);
  const stampedRev = Number(sale.fulfillment_meta?.pos_content_revision ?? 0);
  if (outboxRowSharesClientSaleUuid(row, sale) && outboxRev > stampedRev) {
    return true;
  }
  const rowTotal = Number(row.sale_payload?.order_total ?? row.checkout_body?.pay_now ?? 0);
  const saleTotal = Number(sale.order_total ?? 0);
  if (
    outboxRowSharesClientSaleUuid(row, sale)
    && outboxRev > 0
    && rowTotal > 0
    && Math.abs(rowTotal - saleTotal) > 0.02
  ) {
    return true;
  }
  return false;
}

/**
 * If this offline sale already synced (or an older revision of it did), recover the
 * server row so we mark synced / supersede instead of posting a duplicate.
 */
async function findExistingSyncedSaleForOutboxRow(row, orderNum) {
  const queries = new Set();
  const deferOrgOrderNum = Boolean(
    row.defer_org_order_num ?? row.checkout_body?.defer_org_order_num,
  );
  // When org S# is deferred, row.order_num is only the Cash Sales # label — do not
  // search sales by that number (it is not an organization order_num).
  if (orderNum && !deferOrgOrderNum) queries.add(String(orderNum));
  const { posNum, posDate } = outboxRowPosTicket(row);
  if (posNum != null) queries.add(String(posNum));
  // UUID search only helps new sales (prev-edit uuids are not unique across revisions).
  if (row.sync_kind !== "previous_order_edit" && row.client_sale_uuid) {
    queries.add(String(row.client_sale_uuid));
  }

  const candidates = [];
  const seenIds = new Set();

  async function collectFromRes(res) {
    for (const sale of Array.isArray(res?.data) ? res.data : []) {
      if (!sale?.id || seenIds.has(sale.id)) continue;
      seenIds.add(sale.id);
      candidates.push(sale);
    }
  }

  for (const q of queries) {
    try {
      const res = await apiRequest("/sales", {
        searchParams: {
          q,
          per_page: 50,
          channel: "pos",
          order_source: "pos",
        },
        loading: false,
        reportIssues: false,
      });
      await collectFromRes(res);
    } catch {
      /* try next query */
    }
  }

  // Prefer an exact POS ticket filter when we have one — `q` alone matches loosely.
  if (posNum != null) {
    try {
      const res = await apiRequest("/sales", {
        searchParams: {
          filter_pos_order: String(posNum),
          per_page: 50,
          channel: "pos",
          order_source: "pos",
          ...(posDate ? { from_date: posDate, to_date: posDate, date_field: "placed" } : {}),
        },
        loading: false,
        reportIssues: false,
      });
      await collectFromRes(res);
    } catch {
      /* ignore */
    }
  }

  const exact =
    candidates.find((sale) => outboxRowMatchesServerSale(row, sale, orderNum)) ?? null;
  if (exact) return exact;

  // Older revision of the same offline uuid already on server — caller will supersede
  // with the latest payload (keeps one order #; no Customer A/B cross-write).
  if (row.sync_kind !== "previous_order_edit") {
    const ancestor =
      candidates.find((sale) => outboxNeedsSupersedeOfServerSale(row, sale)) ?? null;
    if (ancestor) return ancestor;
  }

  return null;
}

const reportedOutboxFailureAt = new Map();
const OUTBOX_FAILURE_REPORT_COOLDOWN_MS = 60_000;

function reportPosOutboxSyncFailure(row, err, printedOrderNum) {
  const message = err?.message ?? "Sync failed";
  const httpStatus = err instanceof ApiError ? err.status : null;
  const reportKey = [
    row.client_sale_uuid ?? "",
    row.sync_kind ?? "sale",
    row.content_revision ?? "",
    message,
  ].join("|");
  const lastAt = reportedOutboxFailureAt.get(reportKey) ?? 0;
  if (Date.now() - lastAt < OUTBOX_FAILURE_REPORT_COOLDOWN_MS) {
    return;
  }
  reportedOutboxFailureAt.set(reportKey, Date.now());

  const posTicket =
    row?.sale_payload?.pos_order_num ??
    row?.checkout_body?.pos_order_num ??
    row?.pos_order_num ??
    null;
  const ticketLabel =
    posTicket != null && posTicket !== ""
      ? `Cash Sales #${posTicket}`
      : "offline POS order";

  void submitSystemIssueReport({
    kind: "error",
    message: `POS outbox sync failed for ${ticketLabel}: ${message}`,
    api_path: "/sales/carts/checkout",
    http_method: "POST",
    http_status: httpStatus,
    context: {
      source: "pos_outbox_sync",
      order_num: printedOrderNum,
      pos_order_num: posTicket,
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
 * Never creates a second server sale for the same POS ticket / client uuid — recovers
 * the existing row when checkout would duplicate.
 *
 * @param {{ onProgress?: Function, includeErrors?: boolean, clientSaleUuid?: string }} [options]
 *   includeErrors — when false, skip rows already marked sync_status=error so a stuck
 *   previous_order_edit cannot restore-to-cart / reload the order in a background loop.
 *   Manual Sync and reconnect should pass true (default).
 *   clientSaleUuid — when set, sync only that outbox row (Pending sync popup per-order).
 */
export async function syncPosOfflineOutbox({
  onProgress,
  includeErrors = true,
  clientSaleUuid = null,
  floatSessionId = null,
} = {}) {
  // Exclusive lock is only for short IndexedDB critical sections.
  // Holding it across checkoutOutboxRow / findExisting network calls blocked
  // cashiers on "Saving…" while reconnect flush ran (often 30s+).
  await withPosOfflineExclusiveLock(async () => {
    await idbReclaimStuckSyncingOutbox({ olderThanMs: 5 * 60_000 });
  });
  let pending = await idbListPendingOutbox({ includeErrors });
  const onlyUuid = String(clientSaleUuid ?? "").trim();
  if (onlyUuid) {
    pending = pending.filter((row) => String(row.client_sale_uuid) === onlyUuid);
  }
  const openFloatSessionId =
    Number(floatSessionId ?? 0) > 0 ? Number(floatSessionId) : null;
  const total = pending.length;
  const results = [];
  let done = 0;
  let failed = 0;

  onProgress?.({
    phase: "start",
    current: 0,
    total,
    done: 0,
    failed: 0,
    order_num: null,
    message: total === 0 ? "No offline orders waiting to sync." : `Syncing ${total} order(s)…`,
  });

  for (let index = 0; index < pending.length; index += 1) {
    const listedRow = pending[index];
    const printedOrderNum = Number(listedRow.order_num);
    const listedPosTicket =
      listedRow.sale_payload?.pos_order_num ??
      listedRow.checkout_body?.pos_order_num ??
      listedRow.pos_order_num ??
      null;
    const cashSalesProgressLabel =
      listedPosTicket != null && listedPosTicket !== ""
        ? `Cash Sales #${listedPosTicket}`
        : null;
    const claimed = await withPosOfflineExclusiveLock(async () => {
      const ok = await idbMarkOutboxSyncing(listedRow.client_sale_uuid);
      if (!ok) return null;
      // Always upload the latest IndexedDB payload — not the stale list snapshot.
      const row = (await idbGetOutboxSale(listedRow.client_sale_uuid)) ?? listedRow;
      if (row.sync_status === "editing") {
        // Cashier opened the sale mid-claim — leave pending for later.
        await idbPutOutboxSale({
          ...row,
          sync_status: "pending",
          sync_started_at_ms: null,
          revision_at_sync: null,
          updated_at_ms: Date.now(),
        });
        return { skip: true };
      }
      return { row };
    });
    if (!claimed || claimed.skip) continue;
    const row = claimed.row;

    const current = index + 1;
    onProgress?.({
      phase: "syncing",
      current,
      total,
      done,
      failed,
      order_num: printedOrderNum,
      pos_order_num: listedPosTicket,
      sync_kind: row.sync_kind ?? "sale",
      message:
        row.sync_kind === "previous_order_edit"
          ? cashSalesProgressLabel
            ? `Updating ${current} of ${total} — ${cashSalesProgressLabel}…`
            : `Updating ${current} of ${total}…`
          : cashSalesProgressLabel
            ? `Syncing ${current} of ${total} — ${cashSalesProgressLabel}…`
            : `Syncing ${current} of ${total}…`,
    });

    try {
      let sale = await findExistingSyncedSaleForOutboxRow(row, printedOrderNum);
      let usedOrderNum = printedOrderNum;
      let needsReprint = false;

      if (sale && outboxNeedsSupersedeOfServerSale(row, sale)) {
        // Older revision already on server; upload this edit as a superseding checkout
        // under the same order number (not a second unrelated sale).
        sale = await checkoutOutboxRow(
          {
            ...row,
            sync_kind: "previous_order_edit",
            superseded_sale_id: Number(sale.id),
            server_cart_id: null,
            server_sale_id: Number(sale.id),
            checkout_body: {
              ...(row.checkout_body ?? {}),
              pay_now: 0,
              offline_order: true,
              content_revision: Number(row.content_revision ?? 0),
              client_sale_uuid: row.client_sale_uuid,
            },
          },
          printedOrderNum,
          openFloatSessionId ? { float_session_id: openFloatSessionId } : {},
        );
      } else if (!sale) {
        try {
          sale = await checkoutOutboxRow(
            row,
            printedOrderNum,
            openFloatSessionId ? { float_session_id: openFloatSessionId } : {},
          );
        } catch (firstErr) {
          // Previous-order edit updates an existing online sale — the order # is
          // supposed to exist. Recover / re-restore instead of treating it as a
          // duplicate new upload.
          const prevEditRecoverable =
            row.sync_kind === "previous_order_edit"
            && (
              isDuplicateOrderNumError(firstErr)
              || isCashSalesTicketCollisionError(firstErr)
              || isOpaqueSalesServerError(firstErr)
              || isMissingTemporaryCartError(firstErr)
            );

          if (prevEditRecoverable) {
            sale = await findExistingSyncedSaleForOutboxRow(row, printedOrderNum);
            if (!sale) {
              try {
                sale = await checkoutOutboxRow(
                  { ...row, server_cart_id: null },
                  printedOrderNum,
                  openFloatSessionId ? { float_session_id: openFloatSessionId } : {},
                );
              } catch (retryErr) {
                if (isCashSalesTicketCollisionError(retryErr)) {
                  sale = await checkoutOutboxRow(
                    { ...row, server_cart_id: null },
                    printedOrderNum,
                    {
                      clear_pos_order_num: true,
                      ...(openFloatSessionId
                        ? { float_session_id: openFloatSessionId }
                        : {}),
                    },
                  );
                  needsReprint = true;
                } else {
                  throw retryErr;
                }
              }
            }
          } else if (
            isCashSalesTicketCollisionError(firstErr)
            || isOpaqueSalesServerError(firstErr)
          ) {
            // Cash Sales # already taken — or opaque 500 that often hides that collision.
            // Retry without locking the printed ticket so the API allocates the next free #.
            sale = await checkoutOutboxRow(row, printedOrderNum, {
              clear_pos_order_num: true,
              ...(openFloatSessionId ? { float_session_id: openFloatSessionId } : {}),
            });
            needsReprint = true;
          } else if (isDuplicateOrderNumError(firstErr)) {
            sale = await findExistingSyncedSaleForOutboxRow(row, printedOrderNum);
            if (!sale) {
              // Do not delete the outbox — leave an error so the cashier can retry /
              // investigate. Deleting caused silent loss when recovery missed the uuid.
              throw firstErr;
            }
            // Older revision may already own this order # — apply the latest payload.
            if (outboxNeedsSupersedeOfServerSale(row, sale)) {
              sale = await checkoutOutboxRow(
                {
                  ...row,
                  sync_kind: "previous_order_edit",
                  superseded_sale_id: Number(sale.id),
                  server_cart_id: null,
                  server_sale_id: Number(sale.id),
                  checkout_body: {
                    ...(row.checkout_body ?? {}),
                    pay_now: 0,
                    offline_order: true,
                    content_revision: Number(row.content_revision ?? 0),
                    client_sale_uuid: row.client_sale_uuid,
                  },
                },
                printedOrderNum,
                openFloatSessionId ? { float_session_id: openFloatSessionId } : {},
              );
            }
          } else {
            throw firstErr;
          }
        }
      }

      const originalPosTicket = outboxRowPosTicket(row).posNum;
      const salePosTicket =
        sale?.pos_order_num != null ? Number(sale.pos_order_num) : null;
      if (
        originalPosTicket != null
        && salePosTicket != null
        && originalPosTicket !== salePosTicket
      ) {
        needsReprint = true;
      }
      if (
        sale?.order_num != null
        && Number(sale.order_num) !== Number(printedOrderNum)
      ) {
        needsReprint = true;
        usedOrderNum = Number(sale.order_num);
      }

      await withPosOfflineExclusiveLock(async () => {
        await idbMarkOutboxSynced(row.client_sale_uuid, sale, {
          needs_reprint: needsReprint,
          order_num_changed: needsReprint,
          original_order_num: printedOrderNum,
        });
        if (sale) {
          await seedLocalPosTicketSeqFromSale(sale, openFloatSessionId).catch(() => {});
        }
      });
      done += 1;
      results.push({
        ok: true,
        order_num: Number(sale?.order_num ?? usedOrderNum),
        printed_order_num: printedOrderNum,
        pos_order_num: salePosTicket,
        printed_pos_order_num: originalPosTicket,
        needs_reprint: needsReprint,
        client_sale_uuid: row.client_sale_uuid,
        sync_kind: row.sync_kind ?? "sale",
        sale,
      });
      onProgress?.({
        phase: "item_done",
        current,
        total,
        done,
        failed,
        ok: true,
        order_num: printedOrderNum,
        message: needsReprint
          ? `Synced ${done} of ${total} — Cash Sales #${originalPosTicket ?? "?"}→#${salePosTicket ?? "?"} (reprint)…`
          : `Synced ${done} of ${total}…`,
      });
    } catch (err) {
      const message = outboxSyncErrorMessage(err);
      await withPosOfflineExclusiveLock(async () => {
        await idbMarkOutboxError(row.client_sale_uuid, message);
      });
      reportPosOutboxSyncFailure(row, err, printedOrderNum);
      failed += 1;
      results.push({
        ok: false,
        order_num: printedOrderNum,
        pos_order_num: listedPosTicket,
        printed_pos_order_num: listedPosTicket,
        client_sale_uuid: row.client_sale_uuid,
        sync_kind: row.sync_kind ?? "sale",
        error: message,
      });
      onProgress?.({
        phase: "item_done",
        current,
        total,
        done,
        failed,
        ok: false,
        order_num: printedOrderNum,
        pos_order_num: listedPosTicket,
        error: message,
        message: cashSalesProgressLabel
          ? `Failed ${cashSalesProgressLabel} (${failed} failed)…`
          : `Failed sync (${failed} failed)…`,
      });
    }
  }

  onProgress?.({
    phase: "complete",
    current: total,
    total,
    done,
    failed,
    order_num: null,
    message:
      total === 0
        ? "No offline orders waiting to sync."
        : failed
          ? `Synced ${done} of ${total}; ${failed} failed.`
          : `Synced ${done} of ${total} order(s).`,
  });
  return results;
}

/** True when External POS should sell→save local→print→background sync.
 * Caller must skip this when KRA fiscalization is active — the eTIMS QR only
 * exists after the device responds, so those sales stay server-first.
 * Cash / M-Pesa / bank / credit all use local-first when KRA is off.
 */
export function isLocalFirstCashCheckout(body) {
  // Name kept for callers; method no longer limited to Cash — KRA gating is external.
  void body;
  return true;
}

/** Prepare for offline: catalog + Cash Sales seq peek (no org S# pool). */
export async function preparePosOfflineReady({ floatSessionId = null } = {}) {
  const catalog = await warmPosOfflineCatalog({ force: false });
  // Peek only — Cash Sales # is local; org order_num is assigned on sync.
  const numbers = await ensurePosOfflineOrderNumbers({
    force: false,
    floatSessionId,
  });
  return {
    catalogCount: catalog.count,
    orderNumbersAvailable: numbers.available,
    nextPosOrderNum: numbers.next_pos_order_num ?? null,
    pendingSync: await getPosOfflinePendingCount(),
  };
}
