import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = [];

vi.mock("@/lib/pos-offline-db", async () => {
  const actual = await vi.importActual("@/lib/pos-offline-db");
  return {
    ...actual,
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
    idbCountUnsyncedOutbox: async () => {
      return rows.filter((r) => {
        if (r?.sync_kind === "online_mirror") return false;
        const status = String(r?.sync_status ?? "");
        return (
          status === "pending" ||
          status === "error" ||
          status === "editing" ||
          status === "syncing"
        );
      }).length;
    },
    idbListPendingOutbox: async ({ includeErrors = true } = {}) =>
      rows.filter((r) => {
        if (r?.sync_kind === "online_mirror") return false;
        if (r.sync_status === "pending") return true;
        if (includeErrors && r.sync_status === "error") return true;
        return false;
      }),
  };
});

describe("offline pending sync count", () => {
  beforeEach(() => {
    rows.length = 0;
    vi.resetModules();
  });

  it("counts each unsynced offline sale (1, 2, 3…)", async () => {
    rows.push(
      { client_sale_uuid: "a", sync_status: "pending", sync_kind: "sale", order_num: 32 },
      { client_sale_uuid: "b", sync_status: "pending", sync_kind: "sale", order_num: 33 },
      { client_sale_uuid: "c", sync_status: "pending", sync_kind: "sale", order_num: 34 },
    );
    const { getPosOfflinePendingCount, listPendingOutboxSalesForManage } = await import(
      "@/lib/pos-offline"
    );
    await expect(getPosOfflinePendingCount()).resolves.toBe(3);
    const listed = await listPendingOutboxSalesForManage();
    expect(listed).toHaveLength(3);
  });

  it("ignores synced online mirrors", async () => {
    rows.push(
      { client_sale_uuid: "a", sync_status: "pending", sync_kind: "sale", order_num: 1 },
      {
        client_sale_uuid: "online-mirror-9",
        sync_status: "synced",
        sync_kind: "online_mirror",
        order_num: 9,
      },
    );
    const { getPosOfflinePendingCount } = await import("@/lib/pos-offline");
    await expect(getPosOfflinePendingCount()).resolves.toBe(1);
  });

  it("still counts a sale open for edit", async () => {
    rows.push(
      { client_sale_uuid: "a", sync_status: "pending", sync_kind: "sale", order_num: 1 },
      { client_sale_uuid: "b", sync_status: "editing", sync_kind: "sale", order_num: 2 },
    );
    const { getPosOfflinePendingCount } = await import("@/lib/pos-offline");
    await expect(getPosOfflinePendingCount()).resolves.toBe(2);
  });
});
