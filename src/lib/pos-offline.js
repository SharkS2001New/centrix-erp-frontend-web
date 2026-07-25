import { apiRequest } from "@/lib/api";
import {
  productMatchesCatalogQuery,
  stripProductStockFields,
} from "@/lib/catalog-cache";
import {
  idbAppendOrderNumbers,
  idbClearLocalCart,
  idbCountOrderNumbers,
  idbCountPendingOutbox,
  idbGetAllCatalog,
  idbGetCatalogProduct,
  idbGetLocalCart,
  idbGetMeta,
  idbListPendingOutbox,
  idbMarkOutboxError,
  idbMarkOutboxSynced,
  idbPutCatalogProducts,
  idbPutLocalCart,
  idbPutOutboxSale,
  idbSetMeta,
  idbTakeNextOrderNumber,
  newClientSaleUuid,
} from "@/lib/pos-offline-db";

export const POS_OFFLINE_RESERVE_COUNT = 20;
export const POS_OFFLINE_RESERVE_LOW = 5;
export const POS_OFFLINE_CATALOG_TTL_MS = 15 * 60 * 1000;

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
  if (numbers.length) {
    await idbAppendOrderNumbers(numbers);
  }
  return { reserved: numbers.length, available: await idbCountOrderNumbers() };
}

export async function peekPosOfflineOrderNumberCount() {
  return idbCountOrderNumbers();
}

export async function takePosOfflineOrderNumber() {
  return idbTakeNextOrderNumber();
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

export async function clearLocalPosCart() {
  await idbClearLocalCart("active");
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
    const amount = Math.round(qty * price * 100) / 100;
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
 * Complete an offline cash sale: consume reserved order #, queue outbox, clear cart.
 * @returns {Promise<{ sale: object, outbox: object }>}
 */
export async function completeOfflineCashSale({
  cart,
  user,
  organization,
  cashAmount,
  floatSessionId,
}) {
  const summary = summarizeLocalPosCart(cart);
  if (!summary.lineCount) {
    throw new Error("Cart is empty.");
  }
  const orderNum = await takePosOfflineOrderNumber();
  if (!orderNum) {
    throw new Error(
      "No reserved order numbers left for offline selling. Reconnect briefly to reserve more.",
    );
  }

  const payNow = Math.max(Number(cashAmount ?? summary.amountDue), summary.amountDue);
  const clientSaleUuid = newClientSaleUuid();
  const nowIso = new Date().toISOString();

  const sale = {
    id: `offline:${clientSaleUuid}`,
    client_sale_uuid: clientSaleUuid,
    order_num: orderNum,
    organization_id: organization?.id ?? user?.organization_id ?? null,
    branch_id: cart.branch_id ?? user?.branch_id ?? null,
    till_id: cart.till_id ?? null,
    float_session_id: floatSessionId ?? cart.float_session_id ?? null,
    cashier_id: user?.id ?? null,
    channel: "pos",
    order_source: "pos",
    status: "completed",
    payment_status: "paid",
    payment_method_code: "CASH",
    is_credit_sale: false,
    order_total: summary.total,
    total_vat: summary.vat,
    amount_paid: payNow,
    completed_at: nowIso,
    created_at: nowIso,
    customer_num: cart.customer_num ?? null,
    customer_name_override: cart.customer_name_override ?? null,
    offline_pending_sync: true,
    items: (cart.lines ?? []).map((line, index) => ({
      id: index + 1,
      product_code: line.product_code,
      product_name: line.product_name ?? line.description ?? line.product_code,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      amount: Math.round(Number(line.quantity) * Number(line.unit_price) * 100) / 100,
      uom: line.uom ?? null,
      on_wholesale_retail: Boolean(line.on_wholesale_retail),
      discount_given: Number(line.discount_given ?? 0),
    })),
    payments: [
      {
        id: 1,
        payment_method_code: "CASH",
        amount: payNow,
        payment_method: { code: "CASH", name: "Cash" },
      },
    ],
  };

  const outbox = {
    client_sale_uuid: clientSaleUuid,
    order_num: orderNum,
    sync_status: "pending",
    created_at_ms: Date.now(),
    sale_payload: sale,
    checkout_body: {
      order_num: orderNum,
      payment_method_code: "CASH",
      pay_now: payNow,
      is_credit_sale: false,
      submit_kra: false,
      offline_order: true,
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
    })),
  };

  await idbPutOutboxSale(outbox);
  await clearLocalPosCart();
  return { sale, outbox };
}

export async function getPosOfflinePendingCount() {
  return idbCountPendingOutbox();
}

/**
 * Replay pending offline cash sales to the server when connectivity returns.
 */
export async function syncPosOfflineOutbox({ onProgress } = {}) {
  const pending = await idbListPendingOutbox();
  const results = [];
  for (const row of pending) {
    try {
      onProgress?.({ phase: "syncing", order_num: row.order_num });
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

      const sale = await apiRequest(`/sales/carts/${cartId}/checkout`, {
        method: "POST",
        body: row.checkout_body,
        loading: false,
        reportIssues: false,
      });
      await idbMarkOutboxSynced(row.client_sale_uuid, sale);
      results.push({ ok: true, order_num: row.order_num, sale });
    } catch (err) {
      const message = err?.message ?? "Sync failed";
      await idbMarkOutboxError(row.client_sale_uuid, message);
      results.push({ ok: false, order_num: row.order_num, error: message });
    }
  }
  return results;
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
