/**
 * IndexedDB helpers for External POS short-outage sell (~1.5 hours).
 * Not a full offline app — no service worker; bridge while the till stays open.
 *
 * Cutover: until the first verified Z wipe on a device, all cashiers share the
 * legacy DB. After that Z, each cashier gets `…-o{org}-u{user}` isolation.
 */

import { APP_TIMEZONE, calendarDateInTimezone, todayCalendarDate } from "@/lib/datetime";

/** Shared DB used until the first post-deploy Z wipe enables per-cashier mode. */
export const POS_OFFLINE_DB_NAME = "centrix-pos-offline-v1";
export const POS_OFFLINE_DB_NAME_LEGACY = POS_OFFLINE_DB_NAME;

/** localStorage flag — set only after a verified Z wipe. */
export const POS_OFFLINE_PER_CASHIER_LS_KEY = "centrix.pos.offline.per_cashier_db";

const DB_VERSION = 3;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;
/** @type {string | null} */
let openDbName = null;

/** True while Z-print wipe is in progress — blocks reopen races with outbox sync. */
let wipingOfflineDb = false;

/**
 * Logged-in cashier for per-cashier DB routing.
 * @type {{ organization_id: number, user_id: number } | null}
 */
let activeOfflineOwner = null;

/** Meta key: which cashier/org last owned this device IndexedDB. */
export const POS_OFFLINE_OWNER_META_KEY = "pos_device_owner";

function ownerFingerprint(organizationId, userId) {
  const organization_id = Number(organizationId);
  const user_id = Number(userId);
  if (!Number.isFinite(organization_id) || organization_id <= 0) return null;
  if (!Number.isFinite(user_id) || user_id <= 0) return null;
  return { organization_id, user_id };
}

export function isPosOfflinePerCashierEnabled() {
  try {
    return localStorage.getItem(POS_OFFLINE_PER_CASHIER_LS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Call only after a verified Z wipe — next session uses per-cashier DBs. */
export function enablePosOfflinePerCashierDb() {
  try {
    localStorage.setItem(POS_OFFLINE_PER_CASHIER_LS_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function posOfflineDbNameForOwner(owner) {
  const fp = ownerFingerprint(owner?.organization_id ?? owner?.organizationId, owner?.user_id ?? owner?.userId);
  if (!fp) return POS_OFFLINE_DB_NAME_LEGACY;
  return `${POS_OFFLINE_DB_NAME_LEGACY}-o${fp.organization_id}-u${fp.user_id}`;
}

export function resolveActivePosOfflineDbName() {
  if (isPosOfflinePerCashierEnabled() && activeOfflineOwner) {
    return posOfflineDbNameForOwner(activeOfflineOwner);
  }
  return POS_OFFLINE_DB_NAME_LEGACY;
}

export function getPosOfflineDbOwner() {
  return activeOfflineOwner;
}

/**
 * Bind IndexedDB routing to the logged-in cashier. Closes the open connection
 * when the resolved DB name changes (cashier switch after per-cashier mode).
 *
 * @param {{ organizationId?: number|string|null, userId?: number|string|null }} owner
 */
export async function setPosOfflineDbOwner(owner = {}) {
  const next = ownerFingerprint(owner.organizationId, owner.userId);
  const prevName = resolveActivePosOfflineDbName();
  activeOfflineOwner = next;
  const nextName = resolveActivePosOfflineDbName();
  if (prevName !== nextName || (openDbName != null && openDbName !== nextName)) {
    await closeOpenOfflineDb();
  }
  return { owner: next, dbName: nextName };
}

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (wipingOfflineDb) {
    return Promise.reject(new Error("POS IndexedDB is being reset after Z."));
  }

  const name = resolveActivePosOfflineDbName();
  if (dbPromise && openDbName != null && openDbName !== name) {
    const stale = dbPromise;
    dbPromise = null;
    openDbName = null;
    void stale.then((db) => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }).catch(() => {});
  }

  if (!dbPromise) {
    openDbName = name;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onerror = () => {
        dbPromise = null;
        openDbName = null;
        reject(req.error ?? new Error("Failed to open offline DB."));
      };
      req.onsuccess = () => {
        if (wipingOfflineDb) {
          try {
            req.result.close();
          } catch {
            /* ignore */
          }
          dbPromise = null;
          openDbName = null;
          reject(new Error("POS IndexedDB is being reset after Z."));
          return;
        }
        resolve(req.result);
      };
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const oldVersion = event.oldVersion;
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("catalog")) {
          const catalog = db.createObjectStore("catalog", { keyPath: "product_code" });
          catalog.createIndex("by_name", "product_name", { unique: false });
        }
        if (!db.objectStoreNames.contains("order_numbers")) {
          db.createObjectStore("order_numbers", { keyPath: "order_num" });
        }
        if (!db.objectStoreNames.contains("order_slots")) {
          const slots = db.createObjectStore("order_slots", { keyPath: "slot_id" });
          slots.createIndex("by_order_num", "order_num", { unique: false });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "client_sale_uuid" });
          outbox.createIndex("by_status", "sync_status", { unique: false });
        }
        if (!db.objectStoreNames.contains("local_cart")) {
          db.createObjectStore("local_cart", { keyPath: "id" });
        }
        // Local held parks — no server sale / order_num consumption.
        if (!db.objectStoreNames.contains("held_parks")) {
          const held = db.createObjectStore("held_parks", { keyPath: "id" });
          held.createIndex("by_created", "created_at_ms", { unique: false });
        }

        if (oldVersion > 0 && oldVersion < 2 && db.objectStoreNames.contains("order_numbers")) {
          const tx = event.target.transaction;
          const legacy = tx.objectStore("order_numbers");
          const slots = tx.objectStore("order_slots");
          const reqAll = legacy.getAll();
          reqAll.onsuccess = () => {
            for (const row of reqAll.result ?? []) {
              const orderNum = Number(row.order_num);
              if (!orderNum) continue;
              slots.put({
                slot_id: `legacy-${orderNum}`,
                order_num: orderNum,
                pos_order_num: null,
                pos_order_date: null,
                reserved_at: row.reserved_at ?? Date.now(),
              });
            }
          };
        }
      };
    });
  }
  return dbPromise;
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

/**
 * @template T
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T> | Promise<T>} fn
 */
async function withStore(storeName, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = fn(store);
  const value = result instanceof IDBRequest ? await reqToPromise(result) : await result;
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
  return value;
}

export async function idbGetMeta(key) {
  const row = await withStore("meta", "readonly", (store) => store.get(key));
  return row?.value ?? null;
}

export async function idbSetMeta(key, value) {
  await withStore("meta", "readwrite", (store) => store.put({ key, value }));
}

export async function idbClearStore(storeName) {
  await withStore(storeName, "readwrite", (store) => store.clear());
}

async function closeOpenOfflineDb() {
  if (!dbPromise) {
    openDbName = null;
    return;
  }
  const pending = dbPromise;
  dbPromise = null;
  openDbName = null;
  try {
    const db = await pending;
    try {
      db.close();
    } catch {
      /* already closed */
    }
  } catch {
    /* open failed — nothing to close */
  }
}

/** Object stores that must be empty after Z wipe. */
export const POS_OFFLINE_STORE_NAMES = [
  "held_parks",
  "local_cart",
  "order_slots",
  "order_numbers",
  "catalog",
  "meta",
  "outbox",
];

/**
 * Attempt indexedDB.deleteDatabase. Resolves true only on real onsuccess.
 * Blocked / timed-out deletes resolve false so the caller can clear stores instead
 * of pretending the DB was wiped (that left Cash Sales seq / outbox intact after Z).
 *
 * @param {string} [dbName]
 */
function tryDeleteOfflineDatabase(dbName = resolveActivePosOfflineDbName(), {
  blockedMs = 1_500,
  timeoutMs = 4_000,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const req = indexedDB.deleteDatabase(String(dbName || POS_OFFLINE_DB_NAME_LEGACY));
    req.onsuccess = () => finish(true);
    req.onerror = () => finish(false);
    const schedule =
      typeof window !== "undefined" && typeof window.setTimeout === "function"
        ? window.setTimeout.bind(window)
        : setTimeout;
    req.onblocked = () => {
      schedule(() => finish(false), blockedMs);
    };
    schedule(() => finish(false), timeoutMs);
  });
}

async function countStoreRecords(storeName) {
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(storeName)) return 0;
    return await withStore(storeName, "readonly", (store) => store.count());
  } catch {
    return -1;
  }
}

/**
 * Confirm every POS offline store is empty (or the DB file is gone).
 * @returns {Promise<{ empty: boolean, counts: Record<string, number> }>}
 */
export async function idbVerifyOfflineStoresEmpty() {
  const counts = {};
  let empty = true;
  for (const name of POS_OFFLINE_STORE_NAMES) {
    const n = await countStoreRecords(name);
    counts[name] = n;
    // -1 means open/count failed (often mid-wipe) — treat as not yet verified empty.
    if (n !== 0) empty = false;
  }
  return { empty, counts };
}

/**
 * Clear every object store without deleting the database file.
 * Primary reliability path when deleteDatabase is blocked by another tab/connection.
 */
export async function idbClearAllStores() {
  for (const name of POS_OFFLINE_STORE_NAMES) {
    try {
      await idbClearStore(name);
    } catch {
      /* store may not exist yet */
    }
  }
}

/**
 * Close the open connection and wipe the *active* External POS IndexedDB
 * (legacy shared DB until per-cashier cutover, then this cashier's DB only).
 * Strategy (in order): clear all stores → verify empty → deleteDatabase → re-verify.
 * Truncate (clear) is what must never silently fail; deleteDatabase is best-effort.
 *
 * @param {{ attempts?: number }} [options]
 * @returns {Promise<{ mode: "delete" | "clear", verified: boolean, attempts: number, dbName: string }>}
 */
export async function idbWipeDatabaseCompletely({ attempts = 3 } = {}) {
  if (typeof indexedDB === "undefined") {
    return {
      mode: "clear",
      verified: true,
      attempts: 0,
      dbName: resolveActivePosOfflineDbName(),
    };
  }

  const targetName = resolveActivePosOfflineDbName();
  const maxAttempts = Math.max(1, Number(attempts) || 3);
  let mode = "clear";
  let verified = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    wipingOfflineDb = true;
    try {
      await closeOpenOfflineDb();
      // Always truncate first — never rely on delete alone.
      wipingOfflineDb = false;
      await idbClearAllStores();
      wipingOfflineDb = true;
      await closeOpenOfflineDb();

      const deleted = await tryDeleteOfflineDatabase(targetName, {
        blockedMs: attempt === 1 ? 1_200 : 800,
        timeoutMs: attempt === 1 ? 3_000 : 2_000,
      });
      if (deleted) {
        mode = "delete";
      }

      wipingOfflineDb = false;
      const check = await idbVerifyOfflineStoresEmpty();
      verified = check.empty;
      if (verified) {
        await closeOpenOfflineDb();
        return { mode, verified: true, attempts: attempt, dbName: targetName };
      }
    } finally {
      wipingOfflineDb = false;
      dbPromise = null;
      openDbName = null;
    }
  }

  return { mode, verified: false, attempts: maxAttempts, dbName: targetName };
}

/**
 * Best-effort delete of the legacy shared DB after per-cashier cutover so a
 * later open cannot fall back into pre-Z shared sales.
 */
export async function idbDeleteLegacyOfflineDatabase() {
  if (typeof indexedDB === "undefined") return false;
  await closeOpenOfflineDb();
  return tryDeleteOfflineDatabase(POS_OFFLINE_DB_NAME_LEGACY, {
    blockedMs: 1_000,
    timeoutMs: 3_000,
  });
}

export async function idbPutCatalogProducts(products) {
  const db = await openDb();
  const tx = db.transaction("catalog", "readwrite");
  const store = tx.objectStore("catalog");
  for (const product of products) {
    if (!product?.product_code) continue;
    store.put(product);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllCatalog() {
  return (await withStore("catalog", "readonly", (store) => store.getAll())) ?? [];
}

export async function idbGetCatalogProduct(code) {
  return withStore("catalog", "readonly", (store) => store.get(String(code)));
}

/** One transaction for many catalog lookups (same results as sequential gets). */
export async function idbGetCatalogProducts(codes) {
  const unique = [
    ...new Set((codes ?? []).map((c) => String(c ?? "").trim()).filter(Boolean)),
  ];
  if (!unique.length) return [];
  const db = await openDb();
  const tx = db.transaction("catalog", "readonly");
  const store = tx.objectStore("catalog");
  const rows = await Promise.all(
    unique.map(
      (code) =>
        new Promise((resolve, reject) => {
          const req = store.get(code);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed."));
        }),
    ),
  );
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
  return rows.filter(Boolean);
}

export async function idbReplaceOrderNumbers(numbers) {
  const db = await openDb();
  const tx = db.transaction(["order_slots", "order_numbers"], "readwrite");
  tx.objectStore("order_numbers").clear();
  tx.objectStore("order_slots").clear();
  const slots = tx.objectStore("order_slots");
  for (const order_num of numbers) {
    const n = Number(order_num);
    slots.put({
      slot_id: `legacy-${n}`,
      order_num: n,
      pos_order_num: null,
      pos_order_date: null,
      reserved_at: Date.now(),
    });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** @param {Array<{ order_num: number, pos_order_num?: number|null, pos_order_date?: string|null }>} slotsInput */
export async function idbAppendOrderSlots(slotsInput) {
  const db = await openDb();
  const tx = db.transaction("order_slots", "readwrite");
  const store = tx.objectStore("order_slots");
  for (const slot of slotsInput) {
    const orderNum = Number(slot.order_num);
    if (!orderNum) continue;
    const posNum = slot.pos_order_num != null ? Number(slot.pos_order_num) : null;
    const posDate = normalizePosOrderDate(slot.pos_order_date);
    const slotId =
      posNum != null && posDate
        ? `slot-${orderNum}-${posNum}-${posDate}`
        : `legacy-${orderNum}`;
    store.put({
      slot_id: slotId,
      order_num: orderNum,
      pos_order_num: posNum,
      pos_order_date: posDate,
      reserved_at: Date.now(),
    });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbAppendOrderNumbers(numbers) {
  await idbAppendOrderSlots(
    (numbers ?? []).map((order_num) => ({
      order_num: Number(order_num),
      pos_order_num: null,
      pos_order_date: null,
    })),
  );
}

export async function idbListOrderSlots() {
  const rows = (await withStore("order_slots", "readonly", (store) => store.getAll())) ?? [];
  return rows.sort(
    (a, b) => Number(a.order_num ?? 0) - Number(b.order_num ?? 0),
  );
}

export async function idbListOrderNumbers() {
  const slots = await idbListOrderSlots();
  return slots.map((r) => Number(r.order_num));
}

/** Take the lowest reserved org order # + paired POS thermal ticket (FIFO). */
export async function idbTakeNextOrderSlot() {
  const slots = await idbListOrderSlots();
  if (!slots.length) return null;
  const next = slots[0];
  await withStore("order_slots", "readwrite", (store) => store.delete(next.slot_id));
  return next;
}

/**
 * Drop reserved slots whose Cash Sales # is <= the ticket just issued for that day.
 * Keeps the on-device pool aligned after online checkout claims a reserved number.
 */
export async function idbPurgeOrderSlotsUpToPosTicket(posOrderNum, posOrderDate = null) {
  const ticket = Number(posOrderNum);
  if (!Number.isFinite(ticket) || ticket <= 0) return 0;
  const day = normalizePosOrderDate(posOrderDate) ?? todayPosOrderDate();
  const slots = await idbListOrderSlots();
  const toRemove = slots.filter((slot) => {
    const n = slot.pos_order_num != null ? Number(slot.pos_order_num) : null;
    if (n == null || !Number.isFinite(n) || n > ticket) return false;
    const slotDay = normalizePosOrderDate(slot.pos_order_date) ?? day;
    return slotDay === day;
  });
  if (!toRemove.length) return 0;
  const db = await openDb();
  const tx = db.transaction("order_slots", "readwrite");
  const store = tx.objectStore("order_slots");
  for (const slot of toRemove) {
    store.delete(slot.slot_id);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return toRemove.length;
}

/** @deprecated use idbTakeNextOrderSlot */
export async function idbTakeNextOrderNumber() {
  const slot = await idbTakeNextOrderSlot();
  return slot ? Number(slot.order_num) : null;
}

export async function idbCountOrderNumbers() {
  return withStore("order_slots", "readonly", (store) => store.count());
}

/** Today's POS business date (Africa/Nairobi) — never browser/UTC midnight. */
export function todayPosOrderDate() {
  return todayCalendarDate(APP_TIMEZONE);
}

/**
 * Normalize API/ISO dates to Y-m-d for offline ticket slots + checkout.
 * Always uses the application timezone (East Africa), not UTC prefix from ISO strings.
 */
export function normalizePosOrderDate(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return calendarDateInTimezone(value, APP_TIMEZONE);
}

/** Prevent UTC/browser slip assigning a future POS business date to today's sale. */
export function clampPosOrderBusinessDate(value) {
  const today = todayPosOrderDate();
  const normalized = normalizePosOrderDate(value);
  if (!normalized) return today;
  return normalized > today ? today : normalized;
}

export async function idbPutOutboxSale(sale) {
  await withStore("outbox", "readwrite", (store) => store.put(sale));
}

export async function idbDeleteOutboxSale(uuid) {
  const key = String(uuid ?? "").trim();
  if (!key) return false;
  await withStore("outbox", "readwrite", (store) => store.delete(key));
  return true;
}

export async function idbGetOutboxSale(uuid) {
  return withStore("outbox", "readonly", (store) => store.get(uuid));
}

export async function idbListPendingOutbox({ includeErrors = true } = {}) {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  return rows
    .filter((r) => {
      // Local mirrors of already-uploaded server sales are not pending uploads.
      if (r?.sync_kind === "online_mirror") return false;
      if (r.sync_status === "pending") return true;
      if (includeErrors && r.sync_status === "error") return true;
      return false;
    })
    .sort((a, b) => Number(a.created_at_ms ?? 0) - Number(b.created_at_ms ?? 0));
}

/**
 * Every offline sale still waiting on this till (queued, failed, mid-edit, or mid-upload).
 * Used for the Pending sync badge so cashiers see 1, 2, 3… as they sell offline.
 */
export async function idbListUnsyncedOutbox() {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  return rows
    .filter((r) => {
      if (r?.sync_kind === "online_mirror") return false;
      const status = String(r?.sync_status ?? "");
      return (
        status === "pending" ||
        status === "error" ||
        status === "editing" ||
        status === "syncing"
      );
    })
    .sort((a, b) => Number(a.created_at_ms ?? 0) - Number(b.created_at_ms ?? 0));
}

export async function idbCountUnsyncedOutbox() {
  const rows = await idbListUnsyncedOutbox();
  return rows.length;
}

/** Rows that background flush may retry (excludes failed — those need manual Sync). */
export async function idbListAutoRetryOutbox() {
  return idbListPendingOutbox({ includeErrors: false });
}

/** Pending + mid-edit rows for POS ← browse (excludes syncing/synced). */
export async function idbListEditableOutbox() {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  return rows
    .filter(
      (r) =>
        r.sync_status === "pending" ||
        r.sync_status === "error" ||
        r.sync_status === "editing",
    )
    .sort((a, b) => Number(b.created_at_ms ?? 0) - Number(a.created_at_ms ?? 0));
}

/**
 * Synced outbox rows kept on-device so Cash Sales # browse does not “lose” a sale
 * between upload and the next server list refresh (and survives brief API gaps).
 */
export async function idbListSyncedOutboxForBrowse({
  maxAgeMs = 36 * 60 * 60 * 1000,
  limit = 30,
} = {}) {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  const cutoff = Date.now() - Math.max(0, Number(maxAgeMs) || 0);
  return rows
    .filter((r) => r?.sync_status === "synced" && Number(r.server_sale_id ?? 0) > 0)
    .filter((r) => {
      const at = Number(r.synced_at_ms ?? r.updated_at_ms ?? r.created_at_ms ?? 0);
      return !cutoff || at >= cutoff;
    })
    .sort(
      (a, b) =>
        Number(b.synced_at_ms ?? b.updated_at_ms ?? 0) -
        Number(a.synced_at_ms ?? a.updated_at_ms ?? 0),
    )
    .slice(0, Math.max(1, Number(limit) || 30));
}

/**
 * After a previous-order edit syncs, the outbox row is marked synced (not pending).
 * Resolve the live server sale id so Cash Sales # reopen does not miss the revised receipt.
 */
export async function idbFindSyncedServerSaleIdByPosTicket(ticketNum) {
  const ticket = Number(ticketNum);
  if (!Number.isFinite(ticket) || ticket <= 0) return null;
  const rows = await idbListSyncedOutboxForBrowse({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, limit: 100 });
  const matches = rows.filter((r) => {
    const pos =
      r.sale_payload?.pos_order_num ??
      r.checkout_body?.pos_order_num ??
      null;
    return pos != null && Number(pos) === ticket;
  });
  return matches[0]?.server_sale_id ? Number(matches[0].server_sale_id) : null;
}

export function resolveOutboxClientUuidForCart(cart) {
  if (cart?.offline_client_sale_uuid) {
    return String(cart.offline_client_sale_uuid).trim() || null;
  }
  if (cart?.held_order_num != null && Number(cart.held_order_num) > 0) {
    if (cart?.superseded_sale_id || cart?.offline) {
      return `prev-edit-${Number(cart.held_order_num)}`;
    }
  }
  return null;
}

export async function idbGetOutboxForCart(cart) {
  const uuid = resolveOutboxClientUuidForCart(cart);
  if (!uuid) return null;
  return idbGetOutboxSale(uuid);
}

export async function idbIsOutboxBlockingForCart(cart) {
  const row = await idbGetOutboxForCart(cart);
  if (!row) return false;
  return row.sync_status === "pending" || row.sync_status === "syncing" || row.sync_status === "error";
}

/** Rows left mid-sync after a crash/reload — reclaim for retry. */
export async function idbReclaimStuckSyncingOutbox({ olderThanMs = 5 * 60_000 } = {}) {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  const cutoff = Date.now() - olderThanMs;
  let reclaimed = 0;
  for (const row of rows) {
    if (row.sync_status !== "syncing") continue;
    const started = Number(row.sync_started_at_ms ?? row.updated_at_ms ?? 0);
    if (started && started > cutoff) continue;
    await idbPutOutboxSale({
      ...row,
      sync_status: "pending",
      sync_started_at_ms: null,
      updated_at_ms: Date.now(),
    });
    reclaimed += 1;
  }
  return reclaimed;
}

export async function idbMarkOutboxSyncing(uuid) {
  const existing = await idbGetOutboxSale(uuid);
  if (!existing) return false;
  if (existing.sync_status !== "pending" && existing.sync_status !== "error") {
    return false;
  }
  await idbPutOutboxSale({
    ...existing,
    sync_status: "syncing",
    sync_started_at_ms: Date.now(),
    revision_at_sync: Number(existing.content_revision ?? 0),
    updated_at_ms: Date.now(),
  });
  return true;
}

export async function idbCountPendingOutbox({ includeErrors = true } = {}) {
  const pending = await idbListPendingOutbox({ includeErrors });
  return pending.length;
}

export async function idbCountAutoRetryOutbox() {
  return idbCountPendingOutbox({ includeErrors: false });
}

export async function idbMarkOutboxSynced(uuid, serverSale, extras = {}) {
  const existing = await idbGetOutboxSale(uuid);
  if (!existing) return;

  // Another edit re-queued this row while sync was in flight — keep pending.
  // Also never mark mid-edit rows synced (cashier still has the sale open).
  if (
    existing.sync_status === "pending" ||
    existing.sync_status === "error" ||
    existing.sync_status === "editing"
  ) {
    await idbPutOutboxSale({
      ...existing,
      // Keep editing status if cashier is still in the sale; otherwise pending for re-upload.
      sync_status: existing.sync_status === "editing" ? "editing" : existing.sync_status,
      server_sale_id: serverSale?.id ?? existing.server_sale_id,
      server_order_num: serverSale?.order_num ?? existing.server_order_num ?? existing.order_num,
      updated_at_ms: Date.now(),
    });
    return;
  }

  const revisionNow = Number(existing.content_revision ?? 0);
  const revisionAtSync = Number(existing.revision_at_sync ?? 0);
  if (existing.sync_status === "syncing" && revisionNow !== revisionAtSync) {
    await idbPutOutboxSale({
      ...existing,
      sync_status: "pending",
      sync_started_at_ms: null,
      revision_at_sync: null,
      server_sale_id: serverSale?.id ?? existing.server_sale_id,
      server_order_num: serverSale?.order_num ?? existing.server_order_num ?? existing.order_num,
      // Cart was consumed by checkout — next sync restores the new sale.
      server_cart_id: null,
      superseded_sale_id:
        existing.sync_kind === "previous_order_edit" && serverSale?.id
          ? Number(serverSale.id)
          : existing.superseded_sale_id,
      updated_at_ms: Date.now(),
    });
    return;
  }

  await idbPutOutboxSale({
    ...existing,
    sync_status: "synced",
    synced_at_ms: Date.now(),
    sync_started_at_ms: null,
    revision_at_sync: null,
    server_sale_id: serverSale?.id ?? null,
    server_order_num: serverSale?.order_num ?? existing.order_num,
    printed_order_num: existing.order_num,
    needs_reprint: Boolean(extras.needs_reprint),
    order_num_changed: Boolean(extras.order_num_changed),
    original_order_num: extras.original_order_num ?? existing.order_num,
    // After previous-order checkout the edit cart is gone; next edit restores this sale.
    server_cart_id:
      existing.sync_kind === "previous_order_edit" ? null : existing.server_cart_id,
    superseded_sale_id:
      existing.sync_kind === "previous_order_edit" && serverSale?.id
        ? Number(serverSale.id)
        : existing.superseded_sale_id,
    sale_payload:
      serverSale && typeof serverSale === "object"
        ? { ...(existing.sale_payload ?? {}), ...serverSale, offline_pending_sync: false }
        : existing.sale_payload,
  });
}

export async function idbMarkOutboxError(uuid, message) {
  const existing = await idbGetOutboxSale(uuid);
  if (!existing) return;
  await idbPutOutboxSale({
    ...existing,
    sync_status: "error",
    sync_error: String(message ?? "Sync failed"),
  });
}

export async function idbGetLocalCart(cartId = "active") {
  return withStore("local_cart", "readonly", (store) => store.get(cartId));
}

export async function idbPutLocalCart(cart) {
  await withStore("local_cart", "readwrite", (store) => store.put(cart));
}

export async function idbClearLocalCart(cartId = "active") {
  await withStore("local_cart", "readwrite", (store) => store.delete(cartId));
}

export async function idbPutHeldPark(park) {
  if (!park?.id) throw new Error("Held park id is required.");
  await withStore("held_parks", "readwrite", (store) => store.put(park));
  return park;
}

export async function idbGetHeldPark(id) {
  return withStore("held_parks", "readonly", (store) => store.get(String(id)));
}

export async function idbDeleteHeldPark(id) {
  const key = String(id ?? "").trim();
  if (!key) return false;
  await withStore("held_parks", "readwrite", (store) => store.delete(key));
  return true;
}

export async function idbListHeldParks() {
  const rows = (await withStore("held_parks", "readonly", (store) => store.getAll())) ?? [];
  return rows.sort((a, b) => Number(b.created_at_ms ?? 0) - Number(a.created_at_ms ?? 0));
}

export async function idbCountHeldParks() {
  return withStore("held_parks", "readonly", (store) => store.count());
}

export async function idbClearHeldParks() {
  await idbClearStore("held_parks");
}

/** All outbox rows (any sync_status) — used when resetting device cache after Z. */
export async function idbListAllOutbox() {
  return (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
}

export function newClientSaleUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
