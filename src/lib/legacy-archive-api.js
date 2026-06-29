import { apiRequest } from "@/lib/api";

export async function fetchLegacyArchiveStatus() {
  return apiRequest("/reports/legacy-archive/status");
}

export async function fetchLegacyArchiveSummary(params = {}) {
  return apiRequest("/reports/legacy-archive/summary", { searchParams: params });
}

export async function fetchLegacyArchiveSales(params = {}) {
  return apiRequest("/reports/legacy-archive/sales", { searchParams: params });
}

export async function fetchLegacyArchiveSale(channel, legacyOrderNum, params = {}) {
  return apiRequest(
    `/reports/legacy-archive/sales/${encodeURIComponent(channel)}/${encodeURIComponent(legacyOrderNum)}`,
    { searchParams: params },
  );
}

export async function fetchLegacyArchiveSaleForPrint(channel, legacyOrderNum, params = {}) {
  return fetchLegacyArchiveSale(channel, legacyOrderNum, { ...params, for_print: "1" });
}

export async function materializeLegacySale(channel, legacyOrderNum, saleDate) {
  return apiRequest("/reports/legacy-archive/sales/materialize", {
    method: "POST",
    body: { channel, legacy_order_num: legacyOrderNum, sale_date: saleDate },
  });
}
