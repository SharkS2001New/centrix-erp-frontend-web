import { describe, expect, it } from "vitest";
import { customerPhoneFromRecord, isValidCustomerPhone } from "@/lib/customer-phone";

describe("customer phone details", () => {
  it("finds the first available customer phone field", () => {
    expect(customerPhoneFromRecord({ phone_number: "", customer_phone: "0712345678" })).toBe(
      "0712345678",
    );
  });

  it("requires a plausible phone number", () => {
    expect(isValidCustomerPhone("0712 345 678")).toBe(true);
    expect(isValidCustomerPhone("")).toBe(false);
    expect(isValidCustomerPhone("123")).toBe(false);
  });
});
