import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox = new Map();

vi.mock("@/lib/pos-offline-db", () => ({
  idbListUnsyncedOutbox: async () =>
    [...outbox.values()].sort(
      (a, b) => Number(a.created_at_ms ?? 0) - Number(b.created_at_ms ?? 0),
    ),
}));

describe("previous-order edit upload blocking", () => {
  beforeEach(() => {
    outbox.clear();
    vi.resetModules();
  });

  it("finds queued previous-order edit rows still waiting on sync", async () => {
    outbox.set("prev-5", {
      client_sale_uuid: "prev-5",
      sync_kind: "previous_order_edit",
      sync_status: "pending",
      order_num: 5,
      superseded_sale_id: 101,
      sale_payload: { pos_order_num: 5 },
      created_at_ms: 1,
    });
    outbox.set("sale-new", {
      client_sale_uuid: "sale-new",
      sync_kind: "sale",
      sync_status: "pending",
      order_num: 6,
      created_at_ms: 2,
    });

    const { findInFlightPreviousOrderEditOutbox, formatPreviousOrderEditUploadBlockMessage } =
      await import("@/lib/pos-offline");

    const row = await findInFlightPreviousOrderEditOutbox();
    expect(row?.client_sale_uuid).toBe("prev-5");
    expect(formatPreviousOrderEditUploadBlockMessage(row)).toMatch(/Cash Sales #5/);
    expect(formatPreviousOrderEditUploadBlockMessage(row)).toMatch(/waiting to upload/i);
  });

  it("ignores synced previous-order edit rows", async () => {
    outbox.set("done", {
      client_sale_uuid: "done",
      sync_kind: "previous_order_edit",
      sync_status: "synced",
      order_num: 5,
    });

    const { findInFlightPreviousOrderEditOutbox } = await import("@/lib/pos-offline");
    expect(await findInFlightPreviousOrderEditOutbox()).toBeNull();
  });

  it("formats uploading and error states", async () => {
    const { formatPreviousOrderEditUploadBlockMessage } = await import("@/lib/pos-offline");
    expect(
      formatPreviousOrderEditUploadBlockMessage(
        { sync_status: "syncing", sale_payload: { pos_order_num: 5 } },
        { uploading: true },
      ),
    ).toMatch(/still uploading/i);
    expect(
      formatPreviousOrderEditUploadBlockMessage({
        sync_status: "error",
        sale_payload: { pos_order_num: 5 },
      }),
    ).toMatch(/failed to sync/i);
  });

  it("can scope blocking to one sale id", async () => {
    outbox.set("prev-5", {
      client_sale_uuid: "prev-5",
      sync_kind: "previous_order_edit",
      sync_status: "pending",
      superseded_sale_id: 101,
      sale_payload: { pos_order_num: 5 },
      created_at_ms: 1,
    });
    outbox.set("prev-7", {
      client_sale_uuid: "prev-7",
      sync_kind: "previous_order_edit",
      sync_status: "pending",
      superseded_sale_id: 202,
      sale_payload: { pos_order_num: 7 },
      created_at_ms: 2,
    });

    const { findInFlightPreviousOrderEditOutbox, formatPreviousOrderEditUploadBlockMessage } =
      await import("@/lib/pos-offline");

    const scoped = await findInFlightPreviousOrderEditOutbox({ saleId: 202 });
    expect(scoped?.client_sale_uuid).toBe("prev-7");
    expect(
      formatPreviousOrderEditUploadBlockMessage(scoped, { sameReceipt: true }),
    ).toMatch(/this receipt/i);

    expect(await findInFlightPreviousOrderEditOutbox({ saleId: 999 })).toBeNull();
  });
});
