import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox = new Map();

vi.mock("@/lib/pos-offline-db", () => ({
  idbGetOutboxSale: async (uuid) => outbox.get(String(uuid)) ?? null,
  idbGetLocalCart: async () => null,
  idbPutLocalCart: async () => {},
  idbClearLocalCart: async () => {},
  newClientSaleUuid: () => "uuid-test",
}));

describe("cartHasStaleFailedOutboxAttachment", () => {
  beforeEach(() => {
    outbox.clear();
  });

  it("treats error outbox attachment as stale even when cart still has lines", async () => {
    outbox.set("fail-1", { client_sale_uuid: "fail-1", sync_status: "error" });
    const { cartHasStaleFailedOutboxAttachment } = await import("@/lib/pos-offline");
    const stale = await cartHasStaleFailedOutboxAttachment({
      offline_client_sale_uuid: "fail-1",
      lines: [{ product_code: "A", quantity: 1 }],
    });
    expect(stale).toBe(true);
  });

  it("keeps explicit editing sessions attached", async () => {
    outbox.set("edit-1", { client_sale_uuid: "edit-1", sync_status: "editing" });
    const { cartHasStaleFailedOutboxAttachment } = await import("@/lib/pos-offline");
    const stale = await cartHasStaleFailedOutboxAttachment({
      offline_client_sale_uuid: "edit-1",
      lines: [{ product_code: "A", quantity: 1 }],
    });
    expect(stale).toBe(false);
  });

  it("keeps pending outbox edits attached", async () => {
    outbox.set("pend-1", { client_sale_uuid: "pend-1", sync_status: "pending" });
    const { cartHasStaleFailedOutboxAttachment } = await import("@/lib/pos-offline");
    const stale = await cartHasStaleFailedOutboxAttachment({
      offline_client_sale_uuid: "pend-1",
      lines: [{ product_code: "A", quantity: 1 }],
    });
    expect(stale).toBe(false);
  });
});
