/**
 * IndexedDB helpers for External POS short-outage sell (~30 minutes).
 * Not a full offline app — no service worker; bridge while the till stays open.
 */

const DB_NAME = "centrix-pos-offline-v1";
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error("Failed to open offline DB."));
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
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
        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "client_sale_uuid" });
          outbox.createIndex("by_status", "sync_status", { unique: false });
        }
        if (!db.objectStoreNames.contains("local_cart")) {
          db.createObjectStore("local_cart", { keyPath: "id" });
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

export async function idbReplaceOrderNumbers(numbers) {
  const db = await openDb();
  const tx = db.transaction("order_numbers", "readwrite");
  const store = tx.objectStore("order_numbers");
  store.clear();
  for (const order_num of numbers) {
    store.put({ order_num: Number(order_num), reserved_at: Date.now() });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbAppendOrderNumbers(numbers) {
  const db = await openDb();
  const tx = db.transaction("order_numbers", "readwrite");
  const store = tx.objectStore("order_numbers");
  for (const order_num of numbers) {
    store.put({ order_num: Number(order_num), reserved_at: Date.now() });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbListOrderNumbers() {
  const rows = (await withStore("order_numbers", "readonly", (store) => store.getAll())) ?? [];
  return rows.map((r) => Number(r.order_num)).sort((a, b) => a - b);
}

/** Take the lowest reserved order number (FIFO). */
export async function idbTakeNextOrderNumber() {
  const numbers = await idbListOrderNumbers();
  if (!numbers.length) return null;
  const next = numbers[0];
  await withStore("order_numbers", "readwrite", (store) => store.delete(next));
  return next;
}

export async function idbCountOrderNumbers() {
  return withStore("order_numbers", "readonly", (store) => store.count());
}

export async function idbPutOutboxSale(sale) {
  await withStore("outbox", "readwrite", (store) => store.put(sale));
}

export async function idbGetOutboxSale(uuid) {
  return withStore("outbox", "readonly", (store) => store.get(uuid));
}

export async function idbListPendingOutbox() {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  return rows
    .filter((r) => r.sync_status === "pending" || r.sync_status === "error")
    .sort((a, b) => Number(a.created_at_ms ?? 0) - Number(b.created_at_ms ?? 0));
}

export async function idbCountPendingOutbox() {
  const pending = await idbListPendingOutbox();
  return pending.length;
}

export async function idbMarkOutboxSynced(uuid, serverSale, extras = {}) {
  const existing = await idbGetOutboxSale(uuid);
  if (!existing) return;
  await idbPutOutboxSale({
    ...existing,
    sync_status: "synced",
    synced_at_ms: Date.now(),
    server_sale_id: serverSale?.id ?? null,
    server_order_num: serverSale?.order_num ?? existing.order_num,
    printed_order_num: existing.order_num,
    needs_reprint: Boolean(extras.needs_reprint),
    order_num_changed: Boolean(extras.order_num_changed),
    original_order_num: extras.original_order_num ?? existing.order_num,
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

export function newClientSaleUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
