import { beforeEach, describe, expect, it, vi } from "vitest";

const meta = new Map();

vi.mock("@/lib/pos-offline-db", async () => {
  const actual = await vi.importActual("@/lib/pos-offline-db");
  return {
    ...actual,
    idbGetMeta: async (key) => (meta.has(key) ? meta.get(key) : null),
    idbSetMeta: async (key, value) => {
      meta.set(key, value);
    },
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
