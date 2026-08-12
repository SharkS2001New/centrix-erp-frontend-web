import { beforeEach, describe, expect, it, vi } from "vitest";

const meta = new Map();
const outboxRows = [];

vi.mock("@/lib/pos-offline-db", async () => {
  const actual = await vi.importActual("@/lib/pos-offline-db");
  return {
    ...actual,
    idbGetMeta: async (key) => meta.get(String(key)) ?? null,
    idbSetMeta: async (key, value) => {
      meta.set(String(key), value);
    },
    idbListPendingOutbox: async ({ includeErrors = true } = {}) =>
      outboxRows.filter((r) => {
        if (r.sync_status === "pending") return true;
        if (includeErrors && r.sync_status === "error") return true;
        return false;
      }),
    idbListUnsyncedOutbox: async () => outboxRows,
    idbCountUnsyncedOutbox: async () => outboxRows.length,
  };
});

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(async () => {
    const { todayPosOrderDate } = await import("@/lib/pos-offline-db");
    return {
      next_pos_order_num: 15,
      pos_order_date: todayPosOrderDate(),
    };
  }),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (body, message) => message ?? "error",
}));

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

describe("detectPosTicketOnlineAheadOfLocal", () => {
  beforeEach(() => {
    meta.clear();
    outboxRows.length = 0;
    vi.resetModules();
  });

  it("flags conflict when server receipts are ahead of this device", async () => {
    const { detectPosTicketOnlineAheadOfLocal } = await import("@/lib/pos-offline");
    const result = await detectPosTicketOnlineAheadOfLocal({ floatSessionId: 42 });

    expect(result.conflict).toBe(true);
    expect(result.serverNext).toBe(15);
    expect(result.serverLastIssued).toBe(14);
    expect(result.localHighWater).toBe(0);
  });

  it("does not flag when local device already issued up to the server watermark", async () => {
    const { todayPosOrderDate } = await import("@/lib/pos-offline-db");
    const today = todayPosOrderDate();
    meta.set(`pos_ticket_seq_${today}_s42`, 14);
    outboxRows.push({
      client_sale_uuid: "a",
      sync_status: "pending",
      sale_payload: { pos_order_num: 14, pos_order_date: today, float_session_id: 42 },
    });

    const { detectPosTicketOnlineAheadOfLocal } = await import("@/lib/pos-offline");
    const result = await detectPosTicketOnlineAheadOfLocal({ floatSessionId: 42 });

    expect(result.conflict).toBe(false);
    expect(result.localHighWater).toBe(14);
  });

  it("does not flag a brand-new session with no server sales yet", async () => {
    const { apiRequest } = await import("@/lib/api");
    apiRequest.mockResolvedValueOnce({
      next_pos_order_num: 1,
      pos_order_date: "2026-08-12",
    });

    const { detectPosTicketOnlineAheadOfLocal } = await import("@/lib/pos-offline");
    const result = await detectPosTicketOnlineAheadOfLocal({ floatSessionId: 99 });

    expect(result.conflict).toBe(false);
  });
});

describe("syncLocalPosTicketSeqFromOnline", () => {
  beforeEach(() => {
    meta.clear();
    outboxRows.length = 0;
    vi.resetModules();
  });

  it("raises IndexedDB Cash Sales watermark to the online last issued", async () => {
    const { todayPosOrderDate } = await import("@/lib/pos-offline-db");
    const today = todayPosOrderDate();
    const { syncLocalPosTicketSeqFromOnline } = await import("@/lib/pos-offline");

    const result = await syncLocalPosTicketSeqFromOnline({ floatSessionId: 42 });

    expect(result.raised).toBe(true);
    expect(result.server_last_issued).toBe(14);
    expect(result.next_pos_order_num).toBe(15);
    expect(meta.get(`pos_ticket_seq_${today}_s42`)).toBe(14);
  });

  it("clears the online-ahead conflict after sync", async () => {
    const { syncLocalPosTicketSeqFromOnline, detectPosTicketOnlineAheadOfLocal } =
      await import("@/lib/pos-offline");

    await syncLocalPosTicketSeqFromOnline({ floatSessionId: 42 });
    const check = await detectPosTicketOnlineAheadOfLocal({ floatSessionId: 42 });

    expect(check.conflict).toBe(false);
    expect(check.localHighWater).toBe(14);
  });
});
