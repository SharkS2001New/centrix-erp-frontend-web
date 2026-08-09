import { beforeEach, describe, expect, it, vi } from "vitest";

const meta = new Map();
let pendingOutbox = [];

vi.mock("@/lib/pos-offline-db", async () => {
  const actual = await vi.importActual("@/lib/pos-offline-db");
  return {
    ...actual,
    idbGetMeta: async (key) => (meta.has(key) ? meta.get(key) : null),
    idbSetMeta: async (key, value) => {
      meta.set(key, value);
    },
    idbListPendingOutbox: async () => pendingOutbox,
  };
});

vi.mock("@/lib/pos-offline-lock", () => ({
  withPosOfflineExclusiveLock: async (fn) => fn(),
}));

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
  formatApiErrorMessage: (e) => String(e?.message ?? e),
}));

describe("seedLocalPosTicketSeq — local is source of truth", () => {
  beforeEach(() => {
    meta.clear();
    pendingOutbox = [];
  });

  it("does not rewind local seq when server still sits at last synced #6", async () => {
    const { seedLocalPosTicketSeq, peekLocalPosTicketNext } = await import("@/lib/pos-offline");
    const sessionId = 42;

    // Offline sold through #9 while server last synced #6.
    await seedLocalPosTicketSeq(9, "2026-08-08", sessionId);
    expect(await peekLocalPosTicketNext("2026-08-08", sessionId)).toBe(10);

    // Mid-session reserve peek must not pull the till back to 7.
    await seedLocalPosTicketSeq(6, "2026-08-08", sessionId, { force: true });
    expect(await peekLocalPosTicketNext("2026-08-08", sessionId)).toBe(10);
  });

  it("still raises when server consumed a cancelled ticket ahead of local", async () => {
    const { seedLocalPosTicketSeq, peekLocalPosTicketNext } = await import("@/lib/pos-offline");
    const sessionId = 7;

    await seedLocalPosTicketSeq(5, "2026-08-08", sessionId);
    await seedLocalPosTicketSeq(6, "2026-08-08", sessionId); // server next=7 → lastIssued=6
    expect(await peekLocalPosTicketNext("2026-08-08", sessionId)).toBe(7);
  });

  it("allows force reset to 0 for a new float session key", async () => {
    const { seedLocalPosTicketSeq, peekLocalPosTicketNext } = await import("@/lib/pos-offline");
    const sessionId = 99;

    await seedLocalPosTicketSeq(12, "2026-08-08", sessionId);
    await seedLocalPosTicketSeq(0, "2026-08-08", sessionId, { force: true });
    // No issued tickets → peek returns null (next allocate starts at 1).
    expect(await peekLocalPosTicketNext("2026-08-08", sessionId)).toBeNull();
  });
});

describe("peekIssuedPosTicketMax — pending offline tickets", () => {
  beforeEach(() => {
    meta.clear();
    pendingOutbox = [];
  });

  it("counts pending outbox tickets even when float_session_id is missing", async () => {
    const { seedLocalPosTicketSeq, peekIssuedPosTicketMax, peekNextPosTicketNumber } =
      await import("@/lib/pos-offline");
    const sessionId = 55;

    await seedLocalPosTicketSeq(26, "2026-08-08", sessionId);
    pendingOutbox = [
      {
        sale_payload: {
          pos_order_num: 27,
          pos_order_date: "2026-08-08",
          // Missing float_session_id — previously skipped and rewound next to #26.
        },
        checkout_body: { pos_order_num: 27, pos_order_date: "2026-08-08" },
      },
    ];

    expect(await peekIssuedPosTicketMax("2026-08-08", sessionId)).toBe(27);
    expect(await peekNextPosTicketNumber("2026-08-08", sessionId)).toBe(28);
  });

  it("still ignores tickets stamped to a different float session", async () => {
    const { seedLocalPosTicketSeq, peekIssuedPosTicketMax } = await import("@/lib/pos-offline");
    const sessionId = 55;

    await seedLocalPosTicketSeq(26, "2026-08-08", sessionId);
    pendingOutbox = [
      {
        sale_payload: {
          pos_order_num: 40,
          pos_order_date: "2026-08-08",
          float_session_id: 99,
        },
        cart_seed: { float_session_id: 99 },
      },
    ];

    expect(await peekIssuedPosTicketMax("2026-08-08", sessionId)).toBe(26);
  });
});

describe("seedLocalPosTicketSeqFromSale — online checkout without float_session_id", () => {
  beforeEach(() => {
    meta.clear();
    pendingOutbox = [];
  });

  it("raises the active float-session counter when the sale omits float_session_id", async () => {
    const { seedLocalPosTicketSeqFromSale, peekLocalPosTicketNext } = await import(
      "@/lib/pos-offline"
    );
    const sessionId = 12;

    await seedLocalPosTicketSeqFromSale(
      { pos_order_num: 31, pos_order_date: "2026-08-08" },
      sessionId,
    );
    expect(await peekLocalPosTicketNext("2026-08-08", sessionId)).toBe(32);
  });

  it("after UI next 32 is seeded as lastIssued 31, allocate path peeks 32", async () => {
    const { seedLocalPosTicketSeq, peekLocalPosTicketNext, peekNextPosTicketNumber } =
      await import("@/lib/pos-offline");
    const sessionId = 12;

    // Stale day/session counter left from an older till session.
    await seedLocalPosTicketSeq(13, "2026-08-08", sessionId);
    // Going offline with New Order 32 → seed lastIssued = 31.
    await seedLocalPosTicketSeq(31, "2026-08-08", sessionId);
    expect(await peekLocalPosTicketNext("2026-08-08", sessionId)).toBe(32);
    expect(await peekNextPosTicketNumber("2026-08-08", sessionId)).toBe(32);
  });
});
