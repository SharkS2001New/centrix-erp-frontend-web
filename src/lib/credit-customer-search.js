import { apiRequest } from "@/lib/api";

export function creditCustomerToOption(customer) {
  const name = customer.customer_name?.trim() || `Customer #${customer.customer_num}`;
  const phone = customer.phone_number?.trim();
  const kra = customer.kra_pin?.trim();
  const kraBit = kra ? ` · KRA ${kra}` : "";
  return {
    value: String(customer.customer_num),
    label: phone
      ? `${name} · ${phone}${kraBit}`
      : `${name} (#${customer.customer_num})${kraBit}`,
    searchText: `${name} ${customer.customer_num} ${phone ?? ""} ${customer.additional_phone ?? ""} ${kra ?? ""}`,
    customer,
  };
}

/** Search registered customers for POS credit checkout (sales.create / pos.checkout.create). */
export async function searchCreditCustomers(query, { perPage = 25 } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return [];

  const res = await apiRequest("/sales/customers/lookup", {
    searchParams: { q, per_page: perPage },
  });

  return (res.data ?? []).map(creditCustomerToOption);
}

export async function fetchCreditCustomerByNum(customerNum) {
  const num = Number(customerNum);
  if (!Number.isFinite(num) || num <= 0) return null;

  const res = await apiRequest("/sales/customers/lookup", {
    searchParams: { customer_num: num, per_page: 1 },
  });

  const row = (res.data ?? [])[0];
  return row ?? null;
}
