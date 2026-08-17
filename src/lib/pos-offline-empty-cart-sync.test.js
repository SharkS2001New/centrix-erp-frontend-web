import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  checkoutBodyForOutboxRow,
  isEmptyCartCheckoutError,
} from "./pos-offline";

describe("isEmptyCartCheckoutError", () => {
  it("matches the till-wipe checkout failure", () => {
    expect(isEmptyCartCheckoutError(new Error("Cart is empty."))).toBe(true);
    expect(isEmptyCartCheckoutError(new ApiError("Cart is empty.", 422))).toBe(true);
    expect(isEmptyCartCheckoutError(new Error("Missing edit cart"))).toBe(false);
  });
});

describe("checkoutBodyForOutboxRow", () => {
  it("includes frozen outbox lines so checkout can rebuild a wiped cart", async () => {
    const body = await checkoutBodyForOutboxRow(
      {
        client_sale_uuid: "sale-228",
        order_discount: 0,
        lines: [
          {
            product_code: "SKU-1",
            quantity: 2,
            unit_price: 50,
            amount: 100,
          },
        ],
        checkout_body: {
          payment_method_code: "CASH",
          pay_now: 100,
          pos_order_num: 228,
        },
        sale_payload: {
          pos_order_num: 228,
          order_total: 100,
          amount_paid: 100,
          payment_status: "paid",
        },
      },
      228,
    );

    expect(body.offline_order).toBe(true);
    expect(body.client_sale_uuid).toBe("sale-228");
    expect(body.lines).toEqual([
      expect.objectContaining({
        product_code: "SKU-1",
        quantity: 2,
        amount: 100,
      }),
    ]);
  });
});
