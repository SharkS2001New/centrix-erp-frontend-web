import { describe, expect, it } from "vitest";
import { saleCustomerDisplayLabel } from "@/lib/sales";

describe("saleCustomerDisplayLabel", () => {
  it("adds the customer phone only when enabled", () => {
    const sale = {
      customer_name: "Amina W.",
      customer_phone: "0712345678",
    };

    expect(saleCustomerDisplayLabel(sale)).toBe("Amina W.");
    expect(saleCustomerDisplayLabel(sale, true)).toBe("Amina W. (0712345678)");
  });

  it("uses the related customer phone and omits missing phone values", () => {
    expect(
      saleCustomerDisplayLabel(
        {
          customer_num: "C001",
          customer: { customer_name: "Amina W.", additional_phone: "0712345678" },
        },
        true,
      ),
    ).toBe("Amina W. (0712345678)");
    expect(saleCustomerDisplayLabel({ customer_name: "Amina W." }, true)).toBe("Amina W.");
  });
});
