import { apiRequest } from "@/lib/api";

export async function fetchHotelPosCatalog({
  q = "",
  perPage = 30,
  popularDays = 5,
  offset = 0,
} = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("per_page", String(perPage));
  params.set("popular_days", String(popularDays));
  params.set("offset", String(Math.max(0, offset)));
  return apiRequest(`/hospitality/pos/catalog?${params.toString()}`, { loading: false });
}

export async function openHotelCheck(body = {}) {
  return apiRequest("/hospitality/pos/checks", {
    method: "POST",
    body,
  });
}

export async function fetchHotelCheck(checkId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}`, { loading: false });
}

export async function addHotelCheckLine(checkId, productCode, qty = 1) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/lines`, {
    method: "POST",
    body: { product_code: productCode, qty },
    loading: false,
  });
}

export async function updateHotelCheckLineQty(checkId, lineId, qty) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/lines/${lineId}`, {
    method: "PATCH",
    body: { qty },
    loading: false,
  });
}

export async function removeHotelCheckLine(checkId, lineId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/lines/${lineId}`, {
    method: "DELETE",
    loading: false,
  });
}

export async function clearHotelCheck(checkId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/clear`, {
    method: "POST",
  });
}

export async function holdHotelCheck(checkId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/hold`, {
    method: "POST",
  });
}

export async function resumeHotelCheck(checkId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/resume`, {
    method: "POST",
  });
}

export async function settleHotelCheck(checkId, { amount, payments } = {}) {
  const body = {};
  if (Array.isArray(payments) && payments.length) {
    body.payments = payments;
  } else if (amount != null) {
    body.amount = amount;
    body.method = "CASH";
  } else {
    body.method = "CASH";
  }
  return apiRequest(`/hospitality/pos/checks/${checkId}/settle`, {
    method: "POST",
    body,
  });
}

export async function saveHotelCheck(checkId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/save`, {
    method: "POST",
  });
}

export async function listHeldHotelChecks() {
  return apiRequest("/hospitality/pos/checks/held", { loading: false });
}
