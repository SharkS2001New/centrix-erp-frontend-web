import { apiRequest } from "@/lib/api";

export async function fetchHotelPosCatalog({
  q = "",
  perPage = 30,
  popularDays = 5,
  offset = 0,
  menuGroup = "",
  outletId = null,
} = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (menuGroup) params.set("menu_group", String(menuGroup));
  if (outletId) params.set("outlet_id", String(outletId));
  params.set("per_page", String(perPage));
  params.set("popular_days", String(popularDays));
  params.set("offset", String(Math.max(0, offset)));
  return apiRequest(`/hospitality/pos/catalog?${params.toString()}`, { loading: false });
}

export async function fetchHotelPosSettings() {
  return apiRequest("/hospitality/pos/settings", { loading: false });
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

export async function assignHotelCheckTable(checkId, floorTableId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/table`, {
    method: "PATCH",
    body: { floor_table_id: floorTableId || null },
    loading: false,
  });
}

export async function assignHotelCheckGuest(checkId, guestName) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/guest`, {
    method: "PATCH",
    body: { guest_name: guestName || null },
    loading: false,
  });
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

export async function settleHotelCheck(checkId, { amount, payments, floor_table_id, folio_id } = {}) {
  const body = {};
  if (Array.isArray(payments) && payments.length) {
    body.payments = payments;
  } else if (amount != null) {
    body.amount = amount;
    body.method = "CASH";
  } else {
    body.method = "CASH";
  }
  if (floor_table_id) body.floor_table_id = floor_table_id;
  if (folio_id) body.folio_id = folio_id;
  return apiRequest(`/hospitality/pos/checks/${checkId}/settle`, {
    method: "POST",
    body,
  });
}

/** Idempotent offline cash ticket replay (Hotel POS local sell → sync). */
export async function syncOfflineHotelCheck(body) {
  return apiRequest("/hospitality/pos/checks/offline-sync", {
    method: "POST",
    body,
    loading: false,
    reportIssues: false,
  });
}

export async function reserveHotelCheckNumbers(count = 20) {
  return apiRequest("/hospitality/pos/check-numbers/reserve", {
    method: "POST",
    body: { count },
    loading: false,
    reportIssues: false,
  });
}

export async function fetchHotelPosSellableRooms({ q = "" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", String(q));
  return apiRequest(`/hospitality/pos/rooms?${params.toString()}`, { loading: false });
}

export async function addHotelCheckRoomStay(
  checkId,
  { room_id, nights, checkout_at, guest_name } = {},
) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/room-stays`, {
    method: "POST",
    body: {
      room_id,
      nights,
      checkout_at,
      guest_name: guest_name || null,
    },
  });
}

export async function listOpenHotelFolios() {
  return apiRequest("/hospitality/folios/open", { loading: false });
}

export async function saveHotelCheck(checkId, { floor_table_id } = {}) {
  const body = {};
  if (floor_table_id) body.floor_table_id = floor_table_id;
  return apiRequest(`/hospitality/pos/checks/${checkId}/save`, {
    method: "POST",
    body,
  });
}

export async function voidHotelCheck(checkId) {
  return apiRequest(`/hospitality/pos/checks/${checkId}/void`, {
    method: "POST",
  });
}

export async function listCollectibleHotelChecks() {
  return apiRequest("/hospitality/pos/checks/collectible", { loading: false });
}

/** @deprecated use listCollectibleHotelChecks */
export async function listHeldHotelChecks() {
  return listCollectibleHotelChecks();
}

export async function listHotelFloorTables(outletId = null) {
  const params = new URLSearchParams();
  if (outletId) params.set("outlet_id", String(outletId));
  const qs = params.toString();
  return apiRequest(`/hospitality/floor-tables${qs ? `?${qs}` : ""}`, { loading: false });
}
