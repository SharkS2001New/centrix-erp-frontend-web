export function customerPhoneFromRecord(customer) {
  return [
    customer?.phone_number,
    customer?.customer_phone,
    customer?.phone,
    customer?.additional_phone,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean) ?? "";
}

export function isValidCustomerPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
