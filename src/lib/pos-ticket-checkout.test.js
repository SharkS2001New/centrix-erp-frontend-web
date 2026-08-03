import { describe, expect, it } from "vitest";
import { resolvePosTicketForCheckout } from "@/lib/pos-offline";

describe("resolvePosTicketForCheckout", () => {
  it("uses the on-screen order # box when the cart omits next_pos_order_num", () => {
    expect(
      resolvePosTicketForCheckout(
        { id: 1, channel: "pos", lines: [] },
        { editOrderNo: "6" },
      ),
    ).toEqual({
      pos_order_num: 6,
      pos_order_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("uses the next reserved offline slot pos ticket when present", () => {
    expect(
      resolvePosTicketForCheckout(
        { id: 1, channel: "pos" },
        {
          pendingSlot: { order_num: 33, pos_order_num: 8, pos_order_date: "2026-08-03" },
        },
      ),
    ).toEqual({
      pos_order_num: 8,
      pos_order_date: "2026-08-03",
    });
  });

  it("keeps previous-order edit pos ticket from the source sale", () => {
    expect(
      resolvePosTicketForCheckout(
        { held_order_num: 33, superseded_sale_id: 99, channel: "pos" },
        { sourceSale: { pos_order_num: 4, pos_order_date: "2026-08-03" } },
      ),
    ).toEqual({
      pos_order_num: 4,
      pos_order_date: "2026-08-03",
    });
  });
});
