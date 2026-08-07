import { summarizeLocalPosCart } from "@/lib/pos-offline";

/** Shorthand codes cashiers can type when recording edit refunds / top-ups. */
export const POS_PAYMENT_METHOD_ALIASES = {
  C: "CASH",
  CASH: "CASH",
  M: "MPESA",
  MPESA: "MPESA",
  "M-PESA": "MPESA",
  E: "EQUITY",
  EQUITY: "EQUITY",
  K: "KCB",
  KCB: "KCB",
  ECO: "ECOBANK",
  ECOBANK: "ECOBANK",
  CARD: "CARD",
  BANK: "BANK",
};

const METHOD_HINT =
  "C Cash · M M-Pesa · E Equity · K KCB · ECO Ecobank · or type the full method code";

/**
 * @param {string} raw
 * @param {Array<{ method_code?: string, method_name?: string }>} [catalog]
 */
export function resolvePosPaymentMethodCode(raw, catalog = []) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  if (POS_PAYMENT_METHOD_ALIASES[upper]) {
    return POS_PAYMENT_METHOD_ALIASES[upper];
  }
  if (POS_PAYMENT_METHOD_ALIASES[trimmed.toUpperCase()]) {
    return POS_PAYMENT_METHOD_ALIASES[trimmed.toUpperCase()];
  }
  const exact = catalog.find(
    (row) => String(row.method_code ?? "").toUpperCase() === upper.replace(/-/g, "_"),
  );
  if (exact?.method_code) return String(exact.method_code).toUpperCase();
  const prefix = catalog.find((row) =>
    String(row.method_code ?? "")
      .toUpperCase()
      .startsWith(upper),
  );
  if (prefix?.method_code) return String(prefix.method_code).toUpperCase();
  return upper.replace(/-/g, "_");
}

export function posPaymentMethodHint() {
  return METHOD_HINT;
}

/**
 * @param {object|null|undefined} sourceSale
 * @param {object|null|undefined} cart
 */
export function computePreviousOrderEditPaymentDelta(sourceSale, cart) {
  if (!cart?.held_order_num || !cart?.superseded_sale_id) {
    return { amount: 0, type: null, originalTotal: 0, newTotal: 0 };
  }
  // Prefer the total locked when the edit session started — browse snapshots and
  // remounts often omit order_total, which wrongly treats the whole bill as a top-up.
  const original = Number(
    cart?.original_order_total ??
      sourceSale?.order_total ??
      sourceSale?.amount_paid ??
      0,
  );
  const revised = Number(summarizeLocalPosCart(cart).amountDue ?? 0);
  const delta = Math.round((revised - original) * 100) / 100;
  if (Math.abs(delta) < 0.01) {
    return {
      amount: 0,
      type: null,
      originalTotal: original,
      newTotal: revised,
    };
  }
  return {
    amount: Math.abs(delta),
    type: delta < 0 ? "return" : "topup",
    originalTotal: original,
    newTotal: revised,
    signedDelta: delta,
  };
}

/**
 * Signed delta for KRA-on previous-order edit payment panel (+ top-up, − return).
 *
 * @param {object|null|undefined} sourceSale
 * @param {object|null|undefined} cart
 */
export function computePreviousOrderEditSignedDelta(sourceSale, cart) {
  const delta = computePreviousOrderEditPaymentDelta(sourceSale, cart);
  if (!delta.type) {
    return { ...delta, signedDelta: 0 };
  }
  const signed =
    delta.type === "return" ? -Number(delta.amount) : Number(delta.amount);
  return { ...delta, signedDelta: signed };
}

/**
 * Build sale payment_adjustments[] from a checkout body (F10 payment panel).
 * Amounts are always capped/scaled to the edit delta — never the full revised bill.
 *
 * @param {object|null|undefined} body
 * @param {{ amount?: number, type?: string|null }} delta
 */
export function buildPaymentAdjustmentsFromCheckoutBody(body, delta) {
  if (!delta?.type || !(Number(delta.amount) > 0)) return [];
  const expected = Math.round(Number(delta.amount) * 100) / 100;
  const splits = Array.isArray(body?.payment_splits) ? body.payment_splits : [];
  if (splits.length > 0) {
    const rows = splits
      .filter((row) => Number(row?.amount) > 0)
      .map((row) => ({
        method_code: String(row.method_code ?? body?.payment_method_code ?? "CASH").toUpperCase(),
        amount: Number(row.amount),
        adjustment_type: delta.type,
        reference_number:
          row.reference_number != null && String(row.reference_number).trim() !== ""
            ? String(row.reference_number).trim()
            : body?.payment_reference
              ? String(body.payment_reference).trim()
              : null,
      }));
    if (!rows.length) return [];
    const sum = Math.round(rows.reduce((s, row) => s + Number(row.amount), 0) * 100) / 100;
    if (Math.abs(sum - expected) < 0.02) return rows;
    if (sum <= 0.009) {
      return [
        {
          method_code: rows[0].method_code,
          amount: expected,
          adjustment_type: delta.type,
          reference_number: rows[0].reference_number,
        },
      ];
    }
    const factor = expected / sum;
    const scaled = rows.map((row) => ({
      ...row,
      amount: Math.round(Number(row.amount) * factor * 100) / 100,
    }));
    const scaledSum = Math.round(scaled.reduce((s, row) => s + Number(row.amount), 0) * 100) / 100;
    const drift = Math.round((expected - scaledSum) * 100) / 100;
    if (Math.abs(drift) >= 0.01 && scaled.length) {
      let largest = 0;
      scaled.forEach((row, i) => {
        if (Number(row.amount) >= Number(scaled[largest].amount)) largest = i;
      });
      scaled[largest] = {
        ...scaled[largest],
        amount: Math.round((Number(scaled[largest].amount) + drift) * 100) / 100,
      };
    }
    return scaled.filter((row) => Number(row.amount) > 0.009);
  }
  const methodCode = String(body?.payment_method_code ?? "CASH").toUpperCase();
  // Ignore pay_now when it is the full revised bill — always use the edit delta.
  return [
    {
      method_code: methodCode,
      amount: expected,
      adjustment_type: delta.type,
      reference_number: body?.payment_reference
        ? String(body.payment_reference).trim()
        : null,
    },
  ];
}

/**
 * @param {Array<{ adjustment_type?: string, amount?: number }>|null|undefined} adjustments
 * @param {{ amount: number, type: string|null }} delta
 */
export function previousOrderAdjustmentsMatchDelta(adjustments, delta) {
  if (!delta?.type || !(Number(delta.amount) > 0)) return true;
  if (!Array.isArray(adjustments) || adjustments.length === 0) return false;
  const total = adjustments.reduce(
    (sum, row) =>
      row?.adjustment_type === delta.type ? sum + (Number(row.amount) || 0) : sum,
    0,
  );
  return Math.abs(total - Number(delta.amount)) < 0.02;
}
