import { apiRequest } from "@/lib/api";

/**
 * Post one or more tenders from {@link HotelPosPaymentPanel} onto a guest folio.
 * Uses Admin → Payment methods codes (CASH, MPESA, …).
 *
 * @param {number|string} folioId
 * @param {{ payments?: Array<{ method_code?: string, amount?: number, reference?: string|null }> }} payload
 * @returns {Promise<object|null>} last folio payload from the API
 */
export async function postFolioPaymentsFromPanel(folioId, payload) {
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  if (!folioId || !payments.length) {
    throw new Error("Enter a payment amount.");
  }
  let lastFolio = null;
  for (const row of payments) {
    const amount = Number(row?.amount ?? 0);
    if (!(amount > 0)) continue;
    const code = String(row?.method_code ?? "")
      .toUpperCase()
      .trim();
    if (!code || code === "ROOM") {
      throw new Error("Room charge is for Hotel POS only. Use Cash, M-Pesa, bank, or cheque on the folio.");
    }
    const res = await apiRequest(`/hospitality/folios/${folioId}/payments`, {
      method: "POST",
      body: {
        method_code: code,
        amount,
        reference: row?.reference ? String(row.reference).trim() : null,
      },
    });
    lastFolio = res?.folio ?? lastFolio;
  }
  if (!lastFolio) {
    throw new Error("Enter a payment amount.");
  }
  return lastFolio;
}
