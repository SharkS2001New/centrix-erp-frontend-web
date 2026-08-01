import { apiRequest } from "@/lib/api";

export async function fetchHotelPosCatalog({ q = "", perPage = 120, popularDays = 90 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("per_page", String(perPage));
  params.set("popular_days", String(popularDays));
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

export async function settleHotelCheck(checkId, { amount } = {}) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/settle`, {
    method: "POST",
    body: amount != null ? { amount, method: "CASH" } : { method: "CASH" },
  });
}

export async function listHeldHotelChecks() {
  return apiRequest("/hospitality/pos/checks/held", { loading: false });
}
