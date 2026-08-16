/**
 * IndexedDB for Hotel & Bar POS short-outage sell (mirrors External POS offline DB).
 * Not a full offline app — no service worker; bridge while the till stays open.
 */

const DB_NAME = "centrix-hotel-pos-offline-v1";
const DB_VERSION = 2;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error("Failed to open hotel offline DB."));
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
        if (!db.objectStoreNames.contains("catalog_images")) {
          db.createObjectStore("catalog_images", { keyPath: "product_code" });
        }
        if (!db.objectStoreNames.contains("check_numbers")) {
          db.createObjectStore("check_numbers", { keyPath: "check_number" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          const outbox = db.createObjectStore("outbox", { keyPath: "client_check_uuid" });
          outbox.createIndex("by_status", "sync_status", { unique: false });
        }
        if (!db.objectStoreNames.contains("local_check")) {
          db.createObjectStore("local_check", { keyPath: "id" });
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

export async function idbPutCatalogImage(productCode, blob, mime = "image/jpeg") {
  const code = String(productCode ?? "").trim();
  if (!code || !blob) return;
  await withStore("catalog_images", "readwrite", (store) =>
    store.put({
      product_code: code,
      blob,
      mime: mime || blob.type || "image/jpeg",
      updated_at_ms: Date.now(),
    }),
  );
}

export async function idbGetCatalogImage(productCode) {
  return withStore("catalog_images", "readonly", (store) =>
    store.get(String(productCode ?? "")),
  );
}

export async function idbListCatalogImageCodes() {
  const keys = (await withStore("catalog_images", "readonly", (store) => store.getAllKeys())) ?? [];
  return keys.map((key) => String(key));
}

export async function idbClearCatalogImagesMissing(keepCodes) {
  const keep = new Set((keepCodes ?? []).map((c) => String(c)));
  const rows = (await withStore("catalog_images", "readonly", (store) => store.getAll())) ?? [];
  const stale = rows.filter((row) => !keep.has(String(row.product_code)));
  if (!stale.length) return 0;
  const db = await openDb();
  const tx = db.transaction("catalog_images", "readwrite");
  const store = tx.objectStore("catalog_images");
  for (const row of stale) {
    store.delete(row.product_code);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return stale.length;
}

export async function idbAppendCheckNumbers(numbers) {
  const db = await openDb();
  const tx = db.transaction("check_numbers", "readwrite");
  const store = tx.objectStore("check_numbers");
  for (const raw of numbers ?? []) {
    const n = String(raw ?? "").trim();
    if (!n) continue;
    store.put({ check_number: n, reserved_at: Date.now() });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbListCheckNumbers() {
  const rows = (await withStore("check_numbers", "readonly", (store) => store.getAll())) ?? [];
  return rows
    .map((r) => String(r.check_number))
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));
}

export async function idbTakeNextCheckNumber() {
  const numbers = await idbListCheckNumbers();
  if (!numbers.length) return null;
  const next = numbers[0];
  await withStore("check_numbers", "readwrite", (store) => store.delete(next));
  return next;
}

export async function idbCountCheckNumbers() {
  return withStore("check_numbers", "readonly", (store) => store.count());
}

export async function idbPutOutboxCheck(row) {
  await withStore("outbox", "readwrite", (store) => store.put(row));
}

export async function idbGetOutboxCheck(uuid) {
  return withStore("outbox", "readonly", (store) => store.get(String(uuid)));
}

export async function idbDeleteOutboxCheck(uuid) {
  const key = String(uuid ?? "").trim();
  if (!key) return false;
  await withStore("outbox", "readwrite", (store) => store.delete(key));
  return true;
}

export async function idbListPendingOutbox({ includeErrors = true } = {}) {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  return rows
    .filter((row) => {
      const status = String(row.sync_status ?? "pending");
      if (status === "pending" || status === "syncing") return true;
      if (includeErrors && status === "error") return true;
      return false;
    })
    .sort((a, b) => Number(a.created_at_ms ?? 0) - Number(b.created_at_ms ?? 0));
}

export async function idbListFailedOutbox() {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  return rows.filter((row) => String(row.sync_status) === "error");
}

export async function idbCountPendingOutbox() {
  const rows = await idbListPendingOutbox({ includeErrors: true });
  return rows.length;
}

export async function idbMarkOutboxSyncing(uuid) {
  const row = await idbGetOutboxCheck(uuid);
  if (!row) return false;
  if (row.sync_status === "synced") return false;
  await idbPutOutboxCheck({
    ...row,
    sync_status: "syncing",
    sync_started_at_ms: Date.now(),
  });
  return true;
}

export async function idbMarkOutboxSynced(uuid, check) {
  const row = await idbGetOutboxCheck(uuid);
  if (!row) return;
  await idbPutOutboxCheck({
    ...row,
    sync_status: "synced",
    synced_at_ms: Date.now(),
    server_check_id: check?.id ?? row.server_check_id ?? null,
    server_check_number: check?.check_number ?? row.server_check_number ?? null,
    sync_error: null,
  });
}

export async function idbMarkOutboxError(uuid, message) {
  const row = await idbGetOutboxCheck(uuid);
  if (!row) return;
  await idbPutOutboxCheck({
    ...row,
    sync_status: "error",
    sync_error: String(message ?? "Sync failed"),
    sync_started_at_ms: null,
  });
}

export async function idbReclaimStuckSyncingOutbox({ olderThanMs = 60_000 } = {}) {
  const rows = (await withStore("outbox", "readonly", (store) => store.getAll())) ?? [];
  const cutoff = Date.now() - olderThanMs;
  for (const row of rows) {
    if (row.sync_status !== "syncing") continue;
    if (Number(row.sync_started_at_ms ?? 0) > cutoff) continue;
    await idbPutOutboxCheck({
      ...row,
      sync_status: "pending",
      sync_started_at_ms: null,
    });
  }
}

export async function idbSaveLocalCheck(check) {
  if (!check) return;
  await withStore("local_check", "readwrite", (store) =>
    store.put({ ...check, id: check.id || "active" }),
  );
}

export async function idbGetLocalCheck() {
  return withStore("local_check", "readonly", (store) => store.get("active"));
}

export async function idbClearLocalCheck() {
  await withStore("local_check", "readwrite", (store) => store.delete("active"));
}

export function newClientCheckUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hotel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isLocalHotelCheckId(id) {
  const raw = String(id ?? "");
  return raw === "active" || raw.startsWith("local:") || raw.startsWith("offline:");
}
