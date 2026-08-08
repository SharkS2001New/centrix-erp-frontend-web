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
 * Prior tender mix from sale columns, sale_payments, or amount_paid + method.
 * Mirrors backend CheckoutController::priorSaleTenderMap.
 *
 * @param {object|null|undefined} sourceSale
 * @returns {{ cash: number, mpesa: number, equity: number, kcb: number }}
 */
export function priorSaleTenderMap(sourceSale) {
  const empty = { cash: 0, mpesa: 0, equity: 0, kcb: 0 };
  if (!sourceSale || typeof sourceSale !== "object") return empty;

  let cash = Math.round(Math.max(0, Number(sourceSale.cash) || 0) * 100) / 100;
  let mpesa = Math.round(Math.max(0, Number(sourceSale.mpesa_amount) || 0) * 100) / 100;
  let equity = Math.round(Math.max(0, Number(sourceSale.equity_amount) || 0) * 100) / 100;
  let kcb = Math.round(Math.max(0, Number(sourceSale.kcb_amount) || 0) * 100) / 100;

  if (cash + mpesa + equity + kcb <= 0.009) {
    const payments = Array.isArray(sourceSale.payments) ? sourceSale.payments : [];
    for (const row of payments) {
      const code = String(
        row?.payment_method?.method_code ??
          row?.paymentMethod?.method_code ??
          row?.payment_method_code ??
          row?.method_code ??
          "",
      )
        .trim()
        .toUpperCase();
      const amount = Math.round(Math.max(0, Number(row?.amount) || 0) * 100) / 100;
      if (!(amount > 0) || !code) continue;
      if (code.includes("CASH")) cash += amount;
      else if (code.includes("MPESA") || code.includes("AIRTEL")) mpesa += amount;
      else if (code.includes("EQUITY")) equity += amount;
      else if (code.includes("KCB")) kcb += amount;
      else cash += amount;
    }
  }

  if (cash + mpesa + equity + kcb <= 0.009) {
    const paid = Math.round(Math.max(0, Number(sourceSale.amount_paid) || 0) * 100) / 100;
    if (paid > 0.009) {
      const code = String(sourceSale.payment_method_code ?? "CASH")
        .trim()
        .toUpperCase();
      if (code.includes("MPESA") || code.includes("AIRTEL")) mpesa = paid;
      else if (code.includes("EQUITY")) equity = paid;
      else if (code.includes("KCB")) kcb = paid;
      else cash = paid;
    }
  }

  return { cash, mpesa, equity, kcb };
}

/**
 * Force return/top-up rows to equal |revised − prior| — never the full new bill.
 * Mirrors backend CheckoutController::reconcilePreviousOrderEditAdjustments.
 *
 * @param {Array<{ adjustment_type?: string, method_code?: string, amount?: number, reference_number?: string|null }>} adjustments
 * @param {number} priorTotal
 * @param {number} revisedTotal
 * @param {string} [fallbackMethodCode]
 */
export function reconcilePreviousOrderEditAdjustments(
  adjustments,
  priorTotal,
  revisedTotal,
  fallbackMethodCode = "CASH",
) {
  const expectedSigned =
    Math.round((Number(revisedTotal) || 0) * 100 - (Number(priorTotal) || 0) * 100) / 100;
  if (Math.abs(expectedSigned) < 0.01) return [];

  const type = expectedSigned < 0 ? "return" : "topup";
  const expectedAbs = Math.round(Math.abs(expectedSigned) * 100) / 100;
  const fallback = String(fallbackMethodCode ?? "CASH").trim().toUpperCase() || "CASH";

  const rows = (Array.isArray(adjustments) ? adjustments : [])
    .filter((row) => row?.adjustment_type === type && Number(row?.amount) > 0)
    .map((row) => ({
      method_code: String(row.method_code ?? fallback).trim().toUpperCase() || fallback,
      amount: Math.round(Number(row.amount) * 100) / 100,
      adjustment_type: type,
      reference_number:
        row.reference_number != null && String(row.reference_number).trim() !== ""
          ? String(row.reference_number).trim()
          : null,
    }));

  if (!rows.length) {
    return [
      {
        method_code: fallback,
        amount: expectedAbs,
        adjustment_type: type,
        reference_number: null,
      },
    ];
  }

  const sum = Math.round(rows.reduce((s, row) => s + Number(row.amount), 0) * 100) / 100;
  if (Math.abs(sum - expectedAbs) < 0.02) return rows;

  if (sum <= 0.009) {
    return [
      {
        method_code: rows[0].method_code,
        amount: expectedAbs,
        adjustment_type: type,
        reference_number: rows[0].reference_number,
      },
    ];
  }

  const factor = expectedAbs / sum;
  const scaled = rows.map((row) => ({
    ...row,
    amount: Math.round(Number(row.amount) * factor * 100) / 100,
  }));
  const scaledSum = Math.round(scaled.reduce((s, row) => s + Number(row.amount), 0) * 100) / 100;
  const drift = Math.round((expectedAbs - scaledSum) * 100) / 100;
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

/**
 * @param {object|null|undefined} sourceSale
 * @param {object|null|undefined} cart
 * @param {{ cashRound?: boolean }} [options]
 */
export function computePreviousOrderEditPaymentDelta(sourceSale, cart, options = {}) {
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
  const revised = Number(
    summarizeLocalPosCart(cart, { cashRound: Boolean(options.cashRound) }).amountDue ?? 0,
  );
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
 * @param {{ cashRound?: boolean }} [options]
 */
export function computePreviousOrderEditSignedDelta(sourceSale, cart, options = {}) {
  const delta = computePreviousOrderEditPaymentDelta(sourceSale, cart, options);
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
 * Scale tender method amounts so they sum to the revised order total
 * (mirrors backend CheckoutController::normalizeTenderMapToTotal).
 *
 * @param {{ cash?: number, mpesa?: number, equity?: number, kcb?: number }} tenders
 * @param {number} targetTotal
 */
export function normalizePreviousOrderEditTenders(tenders, targetTotal) {
  const target = Math.round(Math.max(0, Number(targetTotal) || 0) * 100) / 100;
  const next = {
    cash: Math.round(Math.max(0, Number(tenders?.cash) || 0) * 100) / 100,
    mpesa: Math.round(Math.max(0, Number(tenders?.mpesa) || 0) * 100) / 100,
    equity: Math.round(Math.max(0, Number(tenders?.equity) || 0) * 100) / 100,
    kcb: Math.round(Math.max(0, Number(tenders?.kcb) || 0) * 100) / 100,
  };
  if (target <= 0.009) {
    return { cash: 0, mpesa: 0, equity: 0, kcb: 0 };
  }
  const sum = Math.round((next.cash + next.mpesa + next.equity + next.kcb) * 100) / 100;
  if (sum <= 0.009) {
    return next;
  }
  if (Math.abs(sum - target) < 0.02) {
    return next;
  }
  const factor = target / sum;
  const scaled = {
    cash: Math.round(next.cash * factor * 100) / 100,
    mpesa: Math.round(next.mpesa * factor * 100) / 100,
    equity: Math.round(next.equity * factor * 100) / 100,
    kcb: Math.round(next.kcb * factor * 100) / 100,
  };
  const scaledSum =
    Math.round((scaled.cash + scaled.mpesa + scaled.equity + scaled.kcb) * 100) / 100;
  const drift = Math.round((target - scaledSum) * 100) / 100;
  if (Math.abs(drift) >= 0.01) {
    const keys = ["cash", "mpesa", "equity", "kcb"];
    let largest = "cash";
    for (const key of keys) {
      if (scaled[key] >= scaled[largest]) largest = key;
    }
    scaled[largest] = Math.round((scaled[largest] + drift) * 100) / 100;
  }
  return scaled;
}

/**
 * Rebuild Cash/M-Pesa/Equity/KCB from the prior sale ± payment_adjustments, then
 * clamp the mix to the revised order total so receipts never show prior+top-up doubles.
 *
 * @param {object|null|undefined} sourceSale
 * @param {Array<{ adjustment_type?: string, method_code?: string, amount?: number }>} adjustments
 * @param {number} revisedTotal
 */
export function rebuildPreviousOrderEditTenders(sourceSale, adjustments, revisedTotal) {
  const prior = priorSaleTenderMap(sourceSale);
  const priorTenderSum =
    Math.round((prior.cash + prior.mpesa + prior.equity + prior.kcb) * 100) / 100;
  // Prefer explicit order_total; if browse snapshots omit it, fall back to amount_paid
  // then the prior tender mix so we never treat the whole bill as a top-up.
  let priorTotal = Math.round(
    Number(
      sourceSale?.order_total ??
        sourceSale?.original_order_total ??
        sourceSale?.amount_paid ??
        0,
    ) * 100,
  ) / 100;
  if (priorTotal <= 0.009 && priorTenderSum > 0.009) {
    priorTotal = priorTenderSum;
  }
  const target = Math.round(Math.max(0, Number(revisedTotal) || 0) * 100) / 100;
  const fallbackMethod = String(sourceSale?.payment_method_code ?? "CASH")
    .trim()
    .toUpperCase() || "CASH";

  // Drop bogus "top-up = full bill" rows before they double prior M-Pesa on the receipt.
  const rows = reconcilePreviousOrderEditAdjustments(
    adjustments,
    priorTotal,
    target,
    fallbackMethod,
  );

  const returnGiven =
    Math.round(
      rows
        .filter((row) => row.adjustment_type === "return")
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100,
    ) / 100;
  const topupAmount =
    Math.round(
      rows
        .filter((row) => row.adjustment_type === "topup")
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100,
    ) / 100;

  const hasSourcePayments =
    prior.cash > 0 || prior.mpesa > 0 || prior.equity > 0 || prior.kcb > 0;

  let cash = hasSourcePayments ? prior.cash : 0;
  let mpesa = hasSourcePayments ? prior.mpesa : 0;
  let equity = hasSourcePayments ? prior.equity : 0;
  let kcb = hasSourcePayments ? prior.kcb : 0;

  for (const row of rows) {
    if (row.adjustment_type !== "topup") continue;
    const code = String(row.method_code ?? "CASH").toUpperCase();
    const amt = Number(row.amount) || 0;
    if (code.includes("MPESA") || code.includes("AIRTEL")) mpesa += amt;
    else if (code.includes("EQUITY")) equity += amt;
    else if (code.includes("KCB")) kcb += amt;
    else cash += amt;
  }

  if (returnGiven > 0.0001) {
    let remaining = returnGiven;
    const reduce = (current) => {
      const take = Math.min(Math.max(0, current), remaining);
      remaining = Math.round((remaining - take) * 100) / 100;
      return Math.round((current - take) * 100) / 100;
    };
    cash = reduce(cash);
    mpesa = reduce(mpesa);
    equity = reduce(equity);
    kcb = reduce(kcb);
  }

  if (!hasSourcePayments && topupAmount <= 0 && returnGiven <= 0) {
    return {
      cash: 0,
      mpesa: 0,
      equity: 0,
      kcb: 0,
      returnGiven,
      topupAmount,
      amountPaid: target,
      adjustments: rows,
    };
  }

  const normalized = normalizePreviousOrderEditTenders(
    { cash, mpesa, equity, kcb },
    target,
  );
  const amountPaid =
    Math.round(
      (normalized.cash + normalized.mpesa + normalized.equity + normalized.kcb) * 100,
    ) / 100;

  return {
    ...normalized,
    returnGiven,
    topupAmount,
    amountPaid,
    adjustments: rows,
  };
}

/**
 * Build sale.payments[] from tender columns — never a single row of amountPaid
 * (that duplicated M-Pesa when columns already held the same total).
 *
 * @param {{ cash?: number, mpesa?: number, equity?: number, kcb?: number }} tenders
 */
export function paymentRowsFromPreviousOrderEditTenders(tenders) {
  const rows = [];
  const push = (code, name, amount) => {
    const amt = Math.round(Math.max(0, Number(amount) || 0) * 100) / 100;
    if (amt <= 0.009) return;
    rows.push({
      id: rows.length + 1,
      payment_method_code: code,
      method_code: code,
      amount: amt,
      payment_method: { method_code: code, code, name },
    });
  };
  push("CASH", "Cash", tenders?.cash);
  push("MPESA", "M-Pesa", tenders?.mpesa);
  push("EQUITY", "Equity", tenders?.equity);
  push("KCB", "KCB", tenders?.kcb);
  return rows;
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
