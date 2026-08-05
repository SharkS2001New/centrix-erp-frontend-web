/**
 * Hotel & Bar POS short-outage sell: warm catalog + reserved check #s,
 * local cash tickets → outbox → POST /hospitality/pos/checks/offline-sync.
 */

import { apiBaseOrigin, apiRequest, ApiError } from "@/lib/api";
import { apiFetchCredentials } from "@/lib/auth-config";
import { getToken } from "@/lib/auth-storage";
import { fetchHotelPosCatalog } from "@/lib/hospitality-pos-api";
import {
  idbAppendCheckNumbers,
  idbClearCatalogImagesMissing,
  idbClearLocalCheck,
  idbClearStore,
  idbCountCheckNumbers,
  idbCountPendingOutbox,
  idbDeleteOutboxCheck,
  idbGetAllCatalog,
  idbGetCatalogImage,
  idbGetCatalogProduct,
  idbGetLocalCheck,
  idbGetMeta,
  idbGetOutboxCheck,
  idbListFailedOutbox,
  idbListPendingOutbox,
  idbMarkOutboxError,
  idbMarkOutboxSynced,
  idbMarkOutboxSyncing,
  idbPutCatalogImage,
  idbPutCatalogProducts,
  idbPutOutboxCheck,
  idbReclaimStuckSyncingOutbox,
  idbSaveLocalCheck,
  idbSetMeta,
  idbTakeNextCheckNumber,
  isLocalHotelCheckId,
  newClientCheckUuid,
} from "@/lib/hotel-pos-offline-db";

const CATALOG_TTL_MS = 15 * 60 * 1000;
const RESERVE_LOW = 8;
const RESERVE_COUNT = 20;
const IMAGE_WARM_CONCURRENCY = 4;

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function lineVatAmount(lineTotal, vatPct) {
  const rate = Number(vatPct || 0);
  if (rate <= 0) return 0;
  return roundMoney((lineTotal * rate) / (100 + rate));
}

export function summarizeLocalHotelCheck(check) {
  const lines = Array.isArray(check?.lines) ? check.lines : [];
  let subtotal = 0;
  let vatTotal = 0;
  for (const line of lines) {
    const lineTotal = roundMoney(line.line_total ?? Number(line.qty) * Number(line.unit_price));
    subtotal += lineTotal;
    vatTotal += roundMoney(line.vat_amount ?? 0);
  }
  subtotal = roundMoney(subtotal);
  vatTotal = roundMoney(vatTotal);
  const total = subtotal;
  const amountPaid = roundMoney(check?.amount_paid ?? 0);
  return {
    lineCount: lines.length,
    subtotal,
    vat_total: vatTotal,
    total,
    amount_paid: amountPaid,
    balance_due: roundMoney(Math.max(0, total - amountPaid)),
  };
}

export function recalculateLocalHotelCheck(check) {
  const summary = summarizeLocalHotelCheck(check);
  return {
    ...check,
    subtotal: summary.subtotal,
    vat_total: summary.vat_total,
    service_charge: Number(check?.service_charge ?? 0) || 0,
    total: summary.total,
    amount_paid: summary.amount_paid,
    balance_due: summary.balance_due,
  };
}

export async function warmHotelPosOfflineCatalog({
  force = false,
  outletId = null,
  warmImages = true,
} = {}) {
  const channelKey = outletId != null ? `outlet:${outletId}` : "outlet:default";
  const last = Number((await idbGetMeta("catalog_warmed_at")) ?? 0);
  const lastChannel = String((await idbGetMeta("catalog_channel_key")) ?? "");
  const channelChanged = lastChannel !== channelKey;
  if (!force && !channelChanged && last && Date.now() - last < CATALOG_TTL_MS) {
    return { skipped: true, count: (await idbGetAllCatalog()).length };
  }

  const products = [];
  let outlet = null;
  let menuChannel = null;
  let offset = 0;
  let hasMore = true;
  let pages = 0;
  while (hasMore && pages < 40) {
    const res = await fetchHotelPosCatalog({
      q: "",
      perPage: 100,
      popularDays: 5,
      offset,
      outletId: outletId || undefined,
    });
    const batch = Array.isArray(res?.items) ? res.items : [];
    for (const item of batch) {
      if (item?.product_code) products.push(item);
    }
    if (res?.outlet) outlet = res.outlet;
    if (res?.menu_channel) menuChannel = res.menu_channel;
    hasMore = Boolean(res?.has_more);
    offset = res?.next_offset ?? offset + batch.length;
    pages += 1;
    if (!batch.length) break;
  }

  await idbClearStore("catalog");
  await idbPutCatalogProducts(products);
  await idbSetMeta("catalog_warmed_at", Date.now());
  await idbSetMeta("catalog_count", products.length);
  await idbSetMeta("catalog_channel_key", channelKey);
  await idbSetMeta(
    "catalog_menu_channel",
    menuChannel ?? outlet?.menu_channel ?? null,
  );
  await idbSetMeta("catalog_outlet_id", outlet?.id ?? outletId ?? null);

  if (warmImages) {
    void warmHotelPosOfflineImages(products).catch((err) => {
      console.warn("Hotel POS image warm failed", err);
    });
  }

  return {
    skipped: false,
    count: products.length,
    outlet,
    menu_channel: menuChannel ?? outlet?.menu_channel ?? null,
  };
}

/**
 * Download authenticated product photos into IndexedDB for offline tiles.
 * @param {Array<{ product_code: string, has_image?: boolean, image_url?: string }>} products
 */
export async function warmHotelPosOfflineImages(products = []) {
  const withImages = (products ?? []).filter(
    (p) => p?.product_code && (p.has_image || p.image_url),
  );
  if (!withImages.length) return { warmed: 0 };

  const token = getToken();
  const origin = apiBaseOrigin();
  let warmed = 0;

  async function fetchOne(product) {
    const code = String(product.product_code);
    const url = `${origin}/api/v1/products/${encodeURIComponent(code)}/image/file`;
    try {
      const headers = { Accept: "image/*,*/*" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, {
        headers,
        credentials: apiFetchCredentials(),
        cache: "force-cache",
      });
      if (!res.ok) return;
      const blob = await res.blob();
      if (!blob || blob.size < 32) return;
      await idbPutCatalogImage(code, blob, blob.type || "image/jpeg");
      warmed += 1;
    } catch {
      /* skip */
    }
  }

  for (let i = 0; i < withImages.length; i += IMAGE_WARM_CONCURRENCY) {
    const slice = withImages.slice(i, i + IMAGE_WARM_CONCURRENCY);
    await Promise.all(slice.map((p) => fetchOne(p)));
  }

  await idbClearCatalogImagesMissing(withImages.map((p) => p.product_code));
  await idbSetMeta("catalog_images_warmed_at", Date.now());
  return { warmed };
}

/** @returns {Promise<string|null>} blob: URL — caller must revoke when done */
export async function getHotelPosOfflineImageObjectUrl(productCode) {
  const row = await idbGetCatalogImage(productCode);
  if (!row?.blob) return null;
  return URL.createObjectURL(row.blob);
}

export async function searchHotelPosOfflineCatalog(query, { limit = 80, menuGroup = "" } = {}) {
  const all = await idbGetAllCatalog();
  const group = String(menuGroup ?? "").trim().toLowerCase();
  const trimmed = String(query ?? "").trim().toLowerCase();
  let rows = all;
  if (group === "food" || group === "drinks") {
    rows = rows.filter((p) => String(p.menu_group ?? "").toLowerCase() === group);
  }
  if (trimmed) {
    rows = rows.filter((p) => {
      const code = String(p.product_code ?? "").toLowerCase();
      const name = String(p.product_name ?? "").toLowerCase();
      return code.includes(trimmed) || name.includes(trimmed);
    });
  }
  rows = [...rows].sort((a, b) => {
    const sold = Number(b.sold_qty ?? 0) - Number(a.sold_qty ?? 0);
    if (sold !== 0) return sold;
    return String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""));
  });
  return rows.slice(0, limit);
}

export async function ensureHotelPosOfflineCheckNumbers({ force = false } = {}) {
  const available = await idbCountCheckNumbers();
  if (!force && available >= RESERVE_LOW) {
    return { reserved: 0, available };
  }
  const need = Math.max(RESERVE_COUNT - available, RESERVE_COUNT);
  const res = await apiRequest("/hospitality/pos/check-numbers/reserve", {
    method: "POST",
    body: { count: Math.min(need, RESERVE_COUNT) },
    loading: false,
    reportIssues: false,
  });
  const numbers = Array.isArray(res?.numbers) ? res.numbers : [];
  if (numbers.length) {
    await idbAppendCheckNumbers(numbers);
  }
  return { reserved: numbers.length, available: await idbCountCheckNumbers() };
}

export async function peekHotelPosOfflineCheckNumberCount() {
  return idbCountCheckNumbers();
}

export async function getHotelPosOfflinePendingCount() {
  return idbCountPendingOutbox();
}

export async function listFailedHotelOutboxChecks() {
  return idbListFailedOutbox();
}

export async function prepareHotelPosOfflineReady({ outletId = null } = {}) {
  const catalog = await warmHotelPosOfflineCatalog({ force: false, outletId, warmImages: true });
  const numbers = await ensureHotelPosOfflineCheckNumbers({ force: false });
  return {
    catalogCount: catalog.count ?? 0,
    checkNumbersAvailable: numbers.available ?? 0,
    pendingSync: await getHotelPosOfflinePendingCount(),
    menu_channel: catalog.menu_channel ?? null,
  };
}

export async function createLocalHotelCheck({
  user,
  outlet = null,
  floorTableId = null,
  guestName = null,
  branchId = null,
} = {}) {
  let checkNumber = await idbTakeNextCheckNumber();
  if (!checkNumber) {
    try {
      await ensureHotelPosOfflineCheckNumbers({ force: true });
    } catch {
      /* still offline */
    }
    checkNumber = await idbTakeNextCheckNumber();
  }
  if (!checkNumber) {
    throw new Error(
      "No reserved check numbers left for offline selling. Reconnect briefly to reserve more.",
    );
  }

  const tableId = floorTableId ? Number(floorTableId) : null;
  const check = recalculateLocalHotelCheck({
    id: `local:${newClientCheckUuid()}`,
    check_number: String(checkNumber),
    status: "open",
    service_mode: tableId ? "table" : "counter",
    guest_name: guestName ? String(guestName).trim() || null : null,
    outlet_id: outlet?.id ? Number(outlet.id) : null,
    outlet: outlet
      ? { id: outlet.id, code: outlet.code, name: outlet.name }
      : null,
    floor_table_id: tableId,
    floor_table: null,
    branch_id: branchId ?? user?.branch_id ?? null,
    subtotal: 0,
    vat_total: 0,
    service_charge: 0,
    total: 0,
    amount_paid: 0,
    balance_due: 0,
    lines: [],
    payments: [],
    offline: true,
    offline_client_check_uuid: null,
    opened_at: new Date().toISOString(),
  });
  await idbSaveLocalCheck({ ...check, id: "active" });
  return check;
}

export async function addProductToLocalHotelCheck(check, product, qty = 1) {
  if (!product?.product_code) {
    throw new Error("Product code is required.");
  }
  const catalog =
    (await idbGetCatalogProduct(product.product_code)) ??
    product;
  const unitPrice = roundMoney(catalog.unit_price ?? product.unit_price ?? 0);
  const vatPct = Number(catalog.vat_percentage ?? product.vat_percentage ?? 0);
  const addQty = Math.max(0.0001, Number(qty) || 1);
  const lines = [...(check.lines ?? [])];
  const existingIdx = lines.findIndex(
    (l) => String(l.product_code) === String(product.product_code),
  );
  if (existingIdx >= 0) {
    const line = { ...lines[existingIdx] };
    const nextQty = Number(line.qty) + addQty;
    const lineTotal = roundMoney(unitPrice * nextQty);
    line.qty = nextQty;
    line.unit_price = unitPrice;
    line.line_total = lineTotal;
    line.vat_amount = lineVatAmount(lineTotal, vatPct);
    line.description = catalog.product_name ?? line.description;
    lines[existingIdx] = line;
  } else {
    const lineTotal = roundMoney(unitPrice * addQty);
    lines.push({
      id: `local-line-${Date.now()}-${lines.length + 1}`,
      product_id: catalog.id ?? product.id ?? null,
      product_code: product.product_code,
      description: catalog.product_name ?? product.product_name ?? product.product_code,
      qty: addQty,
      unit_price: unitPrice,
      line_total: lineTotal,
      vat_amount: lineVatAmount(lineTotal, vatPct),
      sort_order: lines.length + 1,
      image_url: catalog.image_url ?? product.image_url ?? null,
    });
  }
  const next = recalculateLocalHotelCheck({
    ...check,
    lines,
    offline: true,
  });
  await idbSaveLocalCheck({ ...next, id: "active" });
  return next;
}

export async function updateLocalHotelCheckLineQty(check, lineId, qty) {
  const lines = [...(check.lines ?? [])];
  const idx = lines.findIndex((l) => String(l.id) === String(lineId));
  if (idx < 0) return check;
  if (qty <= 0) {
    lines.splice(idx, 1);
  } else {
    const line = { ...lines[idx] };
    const catalog = line.product_code
      ? await idbGetCatalogProduct(line.product_code)
      : null;
    const vatPct = Number(
      catalog?.vat_percentage ??
        (line.vat_amount && line.line_total
          ? (Number(line.vat_amount) * 100) / (Number(line.line_total) - Number(line.vat_amount) || 1)
          : 0),
    );
    const lineTotal = roundMoney(Number(line.unit_price) * qty);
    line.qty = qty;
    line.line_total = lineTotal;
    line.vat_amount = lineVatAmount(lineTotal, catalog?.vat_percentage ?? vatPct);
    lines[idx] = line;
  }
  const next = recalculateLocalHotelCheck({ ...check, lines, offline: true });
  await idbSaveLocalCheck({ ...next, id: "active" });
  return next;
}

export async function removeLocalHotelCheckLine(check, lineId) {
  return updateLocalHotelCheckLineQty(check, lineId, 0);
}

export async function clearLocalHotelCheckLines(check) {
  const next = recalculateLocalHotelCheck({
    ...check,
    lines: [],
    offline: true,
  });
  await idbSaveLocalCheck({ ...next, id: "active" });
  return next;
}

export async function patchLocalHotelCheck(check, patch) {
  const next = recalculateLocalHotelCheck({
    ...check,
    ...patch,
    offline: true,
  });
  await idbSaveLocalCheck({ ...next, id: "active" });
  return next;
}

export async function loadPersistedLocalHotelCheck() {
  const row = await idbGetLocalCheck();
  if (!row || !Array.isArray(row.lines)) return null;
  return recalculateLocalHotelCheck({ ...row, id: row.check_id || row.id || "active", offline: true });
}

/**
 * Queue a cash-paid local check for sync + return printable snapshot.
 */
export async function completeOfflineHotelCashCheck({
  check,
  user,
  organization,
  cashAmount,
  payments = null,
}) {
  const summary = summarizeLocalHotelCheck(check);
  if (!summary.lineCount) {
    throw new Error("Check is empty.");
  }

  const clientCheckUuid =
    check.offline_client_check_uuid != null && String(check.offline_client_check_uuid).trim()
      ? String(check.offline_client_check_uuid).trim()
      : newClientCheckUuid();

  const payNow = Math.max(Number(cashAmount ?? summary.balance_due), summary.balance_due);
  const existing = await idbGetOutboxCheck(clientCheckUuid);
  const soldAtMs = existing?.created_at_ms ?? Date.now();
  const soldAtIso = new Date(soldAtMs).toISOString();

  const payRows =
    Array.isArray(payments) && payments.length
      ? payments.map((p) => ({
          method_code: String(p.method_code ?? "CASH").toUpperCase(),
          amount: roundMoney(p.amount),
          reference: p.reference ?? null,
        }))
      : [
          {
            method_code: "CASH",
            amount: payNow,
            reference: payNow > summary.balance_due ? `cash_tendered:${payNow}` : null,
          },
        ];

  for (const row of payRows) {
    if (row.method_code !== "CASH") {
      throw new Error("Offline mode supports cash payments only. Reconnect for room charge or M-Pesa.");
    }
  }

  const snapshot = {
    id: `offline:${clientCheckUuid}`,
    client_check_uuid: clientCheckUuid,
    check_number: String(check.check_number),
    status: "paid",
    service_mode: check.service_mode ?? "counter",
    guest_name: check.guest_name ?? null,
    outlet_id: check.outlet_id ?? null,
    outlet: check.outlet ?? null,
    floor_table_id: check.floor_table_id ?? null,
    floor_table: check.floor_table ?? null,
    organization_id: organization?.id ?? user?.organization_id ?? null,
    branch_id: check.branch_id ?? user?.branch_id ?? null,
    subtotal: summary.subtotal,
    vat_total: summary.vat_total,
    service_charge: Number(check.service_charge ?? 0) || 0,
    total: summary.total,
    amount_paid: payNow,
    balance_due: 0,
    opened_at: check.opened_at ?? soldAtIso,
    closed_at: soldAtIso,
    offline_pending_sync: true,
    lines: (check.lines ?? []).map((line, index) => ({
      id: line.id ?? index + 1,
      product_id: line.product_id ?? null,
      product_code: line.product_code,
      description: line.description ?? line.product_name ?? line.product_code,
      qty: Number(line.qty),
      unit_price: Number(line.unit_price),
      line_total: roundMoney(line.line_total ?? Number(line.qty) * Number(line.unit_price)),
      vat_amount: roundMoney(line.vat_amount ?? 0),
      sort_order: line.sort_order ?? index + 1,
      image_url: line.image_url ?? null,
    })),
    payments: payRows.map((p, i) => ({
      id: i + 1,
      method_code: p.method_code,
      amount: p.amount,
      reference: p.reference,
      created_at: soldAtIso,
    })),
  };

  const outbox = {
    client_check_uuid: clientCheckUuid,
    check_number: snapshot.check_number,
    sync_status: existing?.sync_status === "syncing" ? "syncing" : "pending",
    sync_started_at_ms: existing?.sync_status === "syncing" ? existing.sync_started_at_ms : null,
    created_at_ms: soldAtMs,
    updated_at_ms: Date.now(),
    check_payload: snapshot,
    sync_body: {
      client_check_uuid: clientCheckUuid,
      check_number: snapshot.check_number,
      outlet_id: snapshot.outlet_id,
      branch_id: snapshot.branch_id,
      floor_table_id: snapshot.floor_table_id,
      guest_name: snapshot.guest_name,
      offline_order: true,
      client_completed_at: soldAtIso,
      lines: snapshot.lines.map((line) => ({
        product_code: line.product_code,
        qty: line.qty,
      })),
      payments: payRows,
    },
  };

  await idbPutOutboxCheck(outbox);
  await idbClearLocalCheck();
  return { check: snapshot, outbox };
}

function isDuplicateHotelCheckError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (/check[_\s-]?number|duplicate|unique|already exists|1062|idempoten/.test(msg)) {
    return true;
  }
  if (err instanceof ApiError) {
    const body = err.body;
    const blob = JSON.stringify(body ?? {}).toLowerCase();
    if (/check_number|duplicate|unique|1062|client_check_uuid|pos_sync_id/.test(blob)) {
      return true;
    }
    if (err.status === 422 || err.status === 409) {
      return /check|duplicate|unique/.test(msg) || /check|duplicate|unique/.test(blob);
    }
  }
  return false;
}

export async function syncHotelPosOfflineOutbox({ onProgress, includeErrors = true } = {}) {
  await idbReclaimStuckSyncingOutbox({ olderThanMs: 60_000 });
  const pending = await idbListPendingOutbox({ includeErrors });
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
    check_number: null,
    message: total === 0 ? "No offline checks waiting to sync." : `Syncing ${total} check(s)…`,
  });

  for (let index = 0; index < pending.length; index += 1) {
    const row = pending[index];
    const printed = String(row.check_number ?? "");
    const claimed = await idbMarkOutboxSyncing(row.client_check_uuid);
    if (!claimed) continue;

    const current = index + 1;
    onProgress?.({
      phase: "syncing",
      current,
      total,
      done,
      failed,
      check_number: printed,
      message: `Syncing ${current} of ${total} — check #${printed}…`,
    });

    try {
      const res = await apiRequest("/hospitality/pos/checks/offline-sync", {
        method: "POST",
        body: row.sync_body,
        loading: false,
        reportIssues: false,
      });
      const check = res?.check ?? null;
      const serverNum = String(check?.check_number ?? printed);
      const needsReprint = Boolean(serverNum && printed && serverNum !== printed);
      await idbMarkOutboxSynced(row.client_check_uuid, check);
      done += 1;
      results.push({
        ok: true,
        check_number: serverNum,
        printed_check_number: printed,
        needs_reprint: needsReprint,
        client_check_uuid: row.client_check_uuid,
        check,
      });
      onProgress?.({
        phase: "item_done",
        current,
        total,
        done,
        failed,
        ok: true,
        check_number: printed,
        message: `Synced ${done} of ${total}…`,
      });
    } catch (err) {
      if (isDuplicateHotelCheckError(err)) {
        // Server already has this check (idempotency miss / unique collision). Drop local.
        await idbDeleteOutboxCheck(row.client_check_uuid);
        const local = await idbGetLocalCheck();
        if (
          local &&
          (String(local.client_check_uuid ?? "") === String(row.client_check_uuid) ||
            String(local.offline_client_check_uuid ?? "") === String(row.client_check_uuid) ||
            String(local.id ?? "") === `offline:${row.client_check_uuid}`)
        ) {
          await idbClearLocalCheck();
        }
        done += 1;
        results.push({
          ok: true,
          discarded_duplicate: true,
          check_number: printed,
          printed_check_number: printed,
          needs_reprint: false,
          client_check_uuid: row.client_check_uuid,
          check: null,
        });
        onProgress?.({
          phase: "item_done",
          current,
          total,
          done,
          failed,
          ok: true,
          discarded_duplicate: true,
          check_number: printed,
          message: `Cleared local duplicate check #${printed} (${done} of ${total})…`,
        });
        continue;
      }

      const message = err?.message ?? "Sync failed";
      await idbMarkOutboxError(row.client_check_uuid, message);
      failed += 1;
      results.push({
        ok: false,
        check_number: printed,
        client_check_uuid: row.client_check_uuid,
        error: message,
      });
      onProgress?.({
        phase: "item_done",
        current,
        total,
        done,
        failed,
        ok: false,
        check_number: printed,
        error: message,
        message: `Failed check #${printed} (${failed} failed)…`,
      });
    }
  }

  onProgress?.({
    phase: "complete",
    current: total,
    total,
    done,
    failed,
    message:
      total === 0
        ? "No offline checks waiting to sync."
        : failed
          ? `Synced ${done}; ${failed} failed.`
          : `Synced ${done} check(s).`,
  });

  return results;
}

export { isLocalHotelCheckId };
