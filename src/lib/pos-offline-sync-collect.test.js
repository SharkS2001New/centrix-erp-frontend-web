import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = [];
let activeCart = null;

vi.mock("@/lib/pos-offline-db", async () => {
  const actual = await vi.importActual("@/lib/pos-offline-db");
  return {
    ...actual,
    idbGetLocalCart: async () => activeCart,
    idbListUnsyncedOutbox: async () =>
      rows.filter((r) => {
        if (r?.sync_kind === "online_mirror") return false;
        const status = String(r?.sync_status ?? "");
        return (
          status === "pending" ||
          status === "error" ||
          status === "editing" ||
          status === "syncing"
        );
      }),
    idbListPendingOutbox: async ({ includeErrors = true } = {}) =>
      rows.filter((r) => {
        if (r?.sync_kind === "online_mirror") return false;
        if (r.sync_status === "pending") return true;
        if (includeErrors && r.sync_status === "error") return true;
        return false;
      }),
    idbGetOutboxSale: async (uuid) => rows.find((r) => r.client_sale_uuid === uuid) ?? null,
    idbPutOutboxSale: async (row) => {
      const idx = rows.findIndex((r) => r.client_sale_uuid === row.client_sale_uuid);
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
    },
    idbReclaimStuckSyncingOutbox: async ({ olderThanMs = 0 } = {}) => {
      const cutoff = Date.now() - olderThanMs;
      let reclaimed = 0;
      for (const row of rows) {
        if (row.sync_status !== "syncing") continue;
        const started = Number(row.sync_started_at_ms ?? row.updated_at_ms ?? 0);
        if (started && started > cutoff) continue;
        row.sync_status = "pending";
        row.sync_started_at_ms = null;
        reclaimed += 1;
      }
      return reclaimed;
    },
    idbMarkOutboxSyncing: async () => false,
  };
});

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (body, message) => message ?? "error",
}));

describe("syncPosOfflineOutbox manual reclaim", () => {
  beforeEach(() => {
    rows.length = 0;
    activeCart = null;
    vi.resetModules();
  });

  it("reclaims stuck syncing rows on manual sync instead of reporting empty queue", async () => {
    const started = Date.now() - 60_000;
    rows.push(
      {
        client_sale_uuid: "a",
        sync_status: "syncing",
        sync_kind: "sale",
        sync_started_at_ms: started,
        order_num: 1,
        created_at_ms: started,
        checkout_body: { pos_order_num: 10 },
      },
      {
        client_sale_uuid: "b",
        sync_status: "syncing",
        sync_kind: "sale",
        sync_started_at_ms: started,
        order_num: 2,
        created_at_ms: started + 1,
        checkout_body: { pos_order_num: 11 },
      },
    );

    const messages = [];
    const { syncPosOfflineOutbox } = await import("@/lib/pos-offline");
    await syncPosOfflineOutbox({
      manual: true,
      onProgress: (progress) => {
        if (progress.message) messages.push(progress.message);
      },
    });

    expect(rows.every((r) => r.sync_status === "pending")).toBe(true);
    expect(messages[0]).toMatch(/Syncing 2 order/);
  });

  it("explains when orders are still uploading and cannot be reclaimed yet", async () => {
    rows.push({
      client_sale_uuid: "a",
      sync_status: "syncing",
      sync_kind: "sale",
      sync_started_at_ms: Date.now(),
      order_num: 1,
      created_at_ms: Date.now(),
      checkout_body: { pos_order_num: 10 },
    });

    const messages = [];
    const { syncPosOfflineOutbox } = await import("@/lib/pos-offline");
    await syncPosOfflineOutbox({
      manual: false,
      onProgress: (progress) => {
        if (progress.phase === "start" && progress.message) {
          messages.push(progress.message);
        }
      },
    });

    expect(messages[0]).toMatch(/still uploading/i);
  });

  it("reclaims old stuck syncing rows on background sync without manual Sync", async () => {
    const started = Date.now() - 120_000;
    rows.push({
      client_sale_uuid: "old-sync",
      sync_status: "syncing",
      sync_kind: "sale",
      sync_started_at_ms: started,
      order_num: 3,
      created_at_ms: started,
      checkout_body: { pos_order_num: 14 },
    });

    const messages = [];
    const { syncPosOfflineOutbox } = await import("@/lib/pos-offline");
    await syncPosOfflineOutbox({
      manual: false,
      onProgress: (progress) => {
        if (progress.message) messages.push(progress.message);
      },
    });

    expect(rows[0].sync_status).toBe("pending");
    expect(messages[0]).toMatch(/Syncing 1 order/);
  });

  it("retries payment-split mismatch errors even when includeErrors is false", async () => {
    rows.push({
      client_sale_uuid: "split-fail",
      sync_status: "error",
      sync_kind: "sale",
      sync_error: "Payment splits must add up to the amount paid now.",
      order_num: 4,
      created_at_ms: Date.now(),
      checkout_body: {
        pos_order_num: 15,
        pay_now: 9000,
        payment_splits: [{ method_code: "CASH", amount: 100 }],
      },
    });

    const messages = [];
    const { syncPosOfflineOutbox } = await import("@/lib/pos-offline");
    await syncPosOfflineOutbox({
      includeErrors: false,
      manual: false,
      onProgress: (progress) => {
        if (progress.message) messages.push(progress.message);
      },
    });

    expect(messages[0]).toMatch(/Syncing 1 order/);
  });
});
