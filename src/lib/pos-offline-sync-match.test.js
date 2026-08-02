import { describe, expect, it } from "vitest";
import { outboxRowMatchesServerSale } from "@/lib/pos-offline";

describe("outboxRowMatchesServerSale", () => {
  const liveSale = {
    id: 100,
    order_num: 5001,
    pos_order_num: 12,
    pos_order_date: "2026-08-03",
    order_total: 250,
    fulfillment_meta: {},
  };

  it("does not treat the live previous order as already synced just because tickets match", () => {
    const row = {
      sync_kind: "previous_order_edit",
      client_sale_uuid: "prev-edit-5001",
      content_revision: 2,
      checkout_body: {
        order_num: 5001,
        pos_order_num: 12,
        pos_order_date: "2026-08-03",
        pay_now: 275,
      },
      sale_payload: {
        order_total: 275,
        pos_order_num: 12,
        pos_order_date: "2026-08-03",
      },
    };

    expect(outboxRowMatchesServerSale(row, liveSale, 5001)).toBe(false);
  });

  it("does not match previous-order edits by shared client_sale_uuid alone", () => {
    const row = {
      sync_kind: "previous_order_edit",
      client_sale_uuid: "prev-edit-5001",
      content_revision: 3,
      checkout_body: { order_num: 5001, pay_now: 300 },
      sale_payload: { order_total: 300 },
    };
    const priorRevisionSale = {
      ...liveSale,
      id: 101,
      order_total: 275,
      fulfillment_meta: {
        pos_sync_id: "prev-edit-5001:2",
        client_sale_uuid: "prev-edit-5001",
      },
    };

    expect(outboxRowMatchesServerSale(row, priorRevisionSale, 5001)).toBe(false);
  });

  it("matches previous-order edits only on the exact revision pos_sync_id", () => {
    const row = {
      sync_kind: "previous_order_edit",
      client_sale_uuid: "prev-edit-5001",
      content_revision: 2,
      checkout_body: { order_num: 5001, pay_now: 275 },
      sale_payload: { order_total: 275 },
    };
    const synced = {
      ...liveSale,
      id: 101,
      order_total: 275,
      fulfillment_meta: {
        pos_sync_id: "prev-edit-5001:2",
        client_sale_uuid: "prev-edit-5001",
      },
    };

    expect(outboxRowMatchesServerSale(row, synced, 5001)).toBe(true);
  });

  it("does not match a new offline sale to yesterday's POS ticket with the same number", () => {
    const row = {
      sync_kind: "sale",
      client_sale_uuid: "uuid-new-1",
      checkout_body: {
        order_num: 6002,
        pos_order_num: 12,
        pos_order_date: "2026-08-03",
        pay_now: 100,
      },
      sale_payload: {
        order_total: 100,
        pos_order_num: 12,
        pos_order_date: "2026-08-03",
      },
    };
    const yesterdaysTicket = {
      id: 50,
      order_num: 4000,
      pos_order_num: 12,
      pos_order_date: "2026-08-02",
      order_total: 100,
      fulfillment_meta: {},
    };

    expect(outboxRowMatchesServerSale(row, yesterdaysTicket, 6002)).toBe(false);
  });

  it("matches a new offline sale recovered by client uuid", () => {
    const row = {
      sync_kind: "sale",
      client_sale_uuid: "uuid-new-1",
      checkout_body: { order_num: 6002, pay_now: 100 },
      sale_payload: { order_total: 100 },
    };
    const synced = {
      id: 70,
      order_num: 6002,
      order_total: 100,
      fulfillment_meta: {
        pos_sync_id: "uuid-new-1",
        client_sale_uuid: "uuid-new-1",
      },
    };

    expect(outboxRowMatchesServerSale(row, synced, 6002)).toBe(true);
  });

  it("matches a new offline sale by reserved org # + same-day POS ticket + total", () => {
    const row = {
      sync_kind: "sale",
      client_sale_uuid: "uuid-new-2",
      checkout_body: {
        order_num: 6003,
        pos_order_num: 15,
        pos_order_date: "2026-08-03",
        pay_now: 88.5,
      },
      sale_payload: {
        order_total: 88.5,
        pos_order_num: 15,
        pos_order_date: "2026-08-03",
      },
    };
    const synced = {
      id: 71,
      order_num: 6003,
      pos_order_num: 15,
      pos_order_date: "2026-08-03",
      order_total: 88.5,
      fulfillment_meta: {},
    };

    expect(outboxRowMatchesServerSale(row, synced, 6003)).toBe(true);
  });
});
