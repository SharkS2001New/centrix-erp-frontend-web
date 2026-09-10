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

/** Single-letter tenders cashiers combine as CM / CE / MK (mixed payment). */
export const POS_PAYMENT_METHOD_LETTERS = {
  C: "CASH",
  M: "MPESA",
  E: "EQUITY",
  K: "KCB",
};

const METHOD_HINT =
  "C Cash · M M-Pesa · E Equity · K KCB · CM Cash+M-Pesa · ECO Ecobank · or full code";

/**
 * Expand cashier mix shorthand (CM, CE, MK…) into real method codes.
 * Single aliases (C, M, ECO) stay one code. Unknown catalog codes stay as-is.
 *
 * @param {string} raw
 * @param {Array<{ method_code?: string, method_name?: string }>} [catalog]
 * @returns {string[]}
 */
export function expandPosPaymentMethodCodes(raw, catalog = []) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];

  const upperLoose = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  if (POS_PAYMENT_METHOD_ALIASES[upperLoose]) {
    return [POS_PAYMENT_METHOD_ALIASES[upperLoose]];
  }
  if (POS_PAYMENT_METHOD_ALIASES[trimmed.toUpperCase()]) {
    return [POS_PAYMENT_METHOD_ALIASES[trimmed.toUpperCase()]];
  }

  const exact = catalog.find(
    (row) => String(row.method_code ?? "").toUpperCase() === upperLoose.replace(/-/g, "_"),
  );
  if (exact?.method_code) return [String(exact.method_code).toUpperCase()];

  // CM / MC / CE / … — two or more of C/M/E/K with no other letters.
  const lettersOnly = trimmed.toUpperCase().replace(/[\s\-_./+]+/g, "");
  if (/^[CMEK]{2,4}$/.test(lettersOnly) && !POS_PAYMENT_METHOD_ALIASES[lettersOnly]) {
    const codes = [];
    for (const ch of lettersOnly) {
      const code = POS_PAYMENT_METHOD_LETTERS[ch];
      if (code && !codes.includes(code)) codes.push(code);
    }
    if (codes.length >= 2) return codes;
  }

  const prefix = catalog.find((row) =>
    String(row.method_code ?? "")
      .toUpperCase()
      .startsWith(upperLoose),
  );
  if (prefix?.method_code) return [String(prefix.method_code).toUpperCase()];

  return [upperLoose.replace(/-/g, "_")];
}

/**
 * @param {string} raw
 * @param {Array<{ method_code?: string, method_name?: string }>} [catalog]
 */
export function resolvePosPaymentMethodCode(raw, catalog = []) {
  const codes = expandPosPaymentMethodCodes(raw, catalog);
  return codes[0] ?? "";
}

/**
 * Split a money amount across method codes (prior tender weights when provided).
 *
 * @param {number} amount
 * @param {string[]} methodCodes
 * @param {number[]|null} [weights]
 * @returns {Array<{ method_code: string, amount: number }>}
 */
export function splitAmountAcrossPaymentMethods(amount, methodCodes, weights = null) {
  const codes = (Array.isArray(methodCodes) ? methodCodes : [])
    .map((c) => String(c ?? "").trim().toUpperCase())
    .filter(Boolean);
  const total = Math.round(Math.max(0, Number(amount) || 0) * 100) / 100;
  if (!codes.length) return [{ method_code: "CASH", amount: total }];
  if (codes.length === 1 || total <= 0.009) {
    return [{ method_code: codes[0], amount: total }];
  }

  let w = Array.isArray(weights) ? weights.map((n) => Math.max(0, Number(n) || 0)) : [];
  if (w.length !== codes.length) w = codes.map(() => 1);
  const wSum = w.reduce((s, n) => s + n, 0);
  if (wSum <= 0.009) w = codes.map(() => 1);
  const denom = w.reduce((s, n) => s + n, 0) || codes.length;

  const parts = codes.map((method_code, i) => ({
    method_code,
    amount: Math.round(((total * w[i]) / denom) * 100) / 100,
  }));
  const sum = Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const drift = Math.round((total - sum) * 100) / 100;
  if (Math.abs(drift) >= 0.01 && parts.length) {
    parts[parts.length - 1].amount =
      Math.round((parts[parts.length - 1].amount + drift) * 100) / 100;
  }
  return parts.filter((p) => Number(p.amount) > 0.009);
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
      else if (code.includes("EQUITY") || code.includes("ECOBANK") || code === "ECO") equity += amount;
      else if (code.includes("KCB")) kcb += amount;
      else cash += amount;
    }
  }

  if (cash + mpesa + equity + kcb <= 0.009) {
    const paid = Math.round(Math.max(0, Number(sourceSale.amount_paid) || 0) * 100) / 100;
    if (paid > 0.009) {
      const codes = expandPosPaymentMethodCodes(sourceSale.payment_method_code ?? "CASH");
      if (codes.length >= 2) {
        const parts = splitAmountAcrossPaymentMethods(paid, codes);
        for (const part of parts) {
          const bucket = previousOrderEditTenderBucket(part.method_code);
          if (bucket === "mpesa") mpesa += part.amount;
          else if (bucket === "equity") equity += part.amount;
          else if (bucket === "kcb") kcb += part.amount;
          else cash += part.amount;
        }
      } else {
        const code = codes[0] || "CASH";
        if (code.includes("MPESA") || code.includes("AIRTEL")) mpesa = paid;
        else if (code.includes("EQUITY") || code.includes("ECOBANK") || code === "ECO") equity = paid;
        else if (code.includes("KCB")) kcb = paid;
        else cash = paid;
      }
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
  const fallbackCodes = expandPosPaymentMethodCodes(fallback);
  const fallbackPrimary = fallbackCodes[0] || "CASH";

  const rows = (Array.isArray(adjustments) ? adjustments : [])
    .filter((row) => row?.adjustment_type === type && Number(row?.amount) > 0)
    .map((row) => ({
      method_code: String(row.method_code ?? fallbackPrimary).trim().toUpperCase() || fallbackPrimary,
      amount: Math.round(Number(row.amount) * 100) / 100,
      adjustment_type: type,
      reference_number:
        row.reference_number != null && String(row.reference_number).trim() !== ""
          ? String(row.reference_number).trim()
          : null,
    }));

  let reconciled;
  if (!rows.length) {
    reconciled = [
      {
        method_code: fallbackPrimary,
        amount: expectedAbs,
        adjustment_type: type,
        reference_number: null,
      },
    ];
  } else {
    const sum = Math.round(rows.reduce((s, row) => s + Number(row.amount), 0) * 100) / 100;
    if (Math.abs(sum - expectedAbs) < 0.02) {
      reconciled = rows;
    } else if (sum <= 0.009) {
      reconciled = [
        {
          method_code: rows[0].method_code,
          amount: expectedAbs,
          adjustment_type: type,
          reference_number: rows[0].reference_number,
        },
      ];
    } else {
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
      reconciled = scaled.filter((row) => Number(row.amount) > 0.009);
    }
  }

  // CM / CE typed as one method → Cash + M-Pesa (etc.) rows before sync.
  return normalizePaymentAdjustmentMethodCodes(
    reconciled.length
      ? reconciled
      : splitAmountAcrossPaymentMethods(expectedAbs, fallbackCodes).map((part) => ({
          ...part,
          adjustment_type: type,
          reference_number: null,
        })),
  );
}

/**
 * Prior bill total for previous-order edit top-up / return.
 * Browse rows and remounts often omit order_total (or lock 0); fall back to amount_paid,
 * offline snapshot, then tender columns so Alt+P never shows "Was 0 → full bill".
 *
 * @param {object|null|undefined} sourceSale
 * @param {object|null|undefined} cart
 */
export function resolvePreviousOrderEditPriorTotal(sourceSale, cart) {
  const candidates = [
    cart?.original_order_total,
    cart?.offline_edit_snapshot?.order_total,
    cart?.offline_edit_snapshot?.amount_paid,
    cart?.offline_edit_snapshot?.original_order_total,
    sourceSale?.order_total,
    sourceSale?.original_order_total,
    sourceSale?.amount_paid,
  ];
  for (const value of candidates) {
    if (value == null || value === "") continue;
    const n = Math.round(Number(value) * 100) / 100;
    if (Number.isFinite(n) && n > 0.009) return n;
  }

  const tenderSources = [sourceSale, cart?.offline_edit_snapshot];
  let bestTender = 0;
  for (const src of tenderSources) {
    if (!src || typeof src !== "object") continue;
    const prior = priorSaleTenderMap(src);
    const sum =
      Math.round((prior.cash + prior.mpesa + prior.equity + prior.kcb) * 100) / 100;
    if (sum > bestTender) bestTender = sum;
  }
  return bestTender > 0.009 ? bestTender : 0;
}

/**
 * @param {object|null|undefined} sourceSale
 * @param {object|null|undefined} cart
 * @param {{ cashRound?: boolean }} [options]
 */
export function computePreviousOrderEditPaymentDelta(sourceSale, cart, options = {}) {
  // Online revise uses superseded_sale_id; offline / pending-sync revise uses
  // offline_client_sale_uuid. Both need top-up / return Payment Breakdown.
  const isPreviousOrderEdit = Boolean(
    cart?.held_order_num &&
      (cart?.superseded_sale_id || cart?.offline_client_sale_uuid),
  );
  if (!isPreviousOrderEdit) {
    return { amount: 0, type: null, originalTotal: 0, newTotal: 0 };
  }
  // Treat 0 / missing as unresolved — never use a locked 0 when tenders/snapshot exist.
  const original = resolvePreviousOrderEditPriorTotal(sourceSale, cart);
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
    let reconciled;
    if (Math.abs(sum - expected) < 0.02) {
      reconciled = rows;
    } else if (sum <= 0.009) {
      reconciled = [
        {
          method_code: rows[0].method_code,
          amount: expected,
          adjustment_type: delta.type,
          reference_number: rows[0].reference_number,
        },
      ];
    } else {
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
      reconciled = scaled.filter((row) => Number(row.amount) > 0.009);
    }
    return normalizePaymentAdjustmentMethodCodes(reconciled);
  }
  const methodCode = String(body?.payment_method_code ?? "CASH").toUpperCase();
  // Ignore pay_now when it is the full revised bill — always use the edit delta.
  return normalizePaymentAdjustmentMethodCodes([
    {
      method_code: methodCode,
      amount: expected,
      adjustment_type: delta.type,
      reference_number: body?.payment_reference
        ? String(body.payment_reference).trim()
        : null,
    },
  ]);
}

/**
 * Map a payment method code onto the Cash / M-Pesa / Equity / KCB tender buckets.
 * @param {string} code
 * @returns {"cash"|"mpesa"|"equity"|"kcb"}
 */
export function previousOrderEditTenderBucket(code) {
  const normalized = String(code ?? "CASH").trim().toUpperCase();
  if (normalized.includes("MPESA") || normalized.includes("AIRTEL")) return "mpesa";
  if (normalized.includes("EQUITY") || normalized.includes("ECOBANK") || normalized === "ECO") {
    return "equity";
  }
  if (normalized.includes("KCB")) return "kcb";
  return "cash";
}

/**
 * Expand CM-style method codes on payment_adjustments so sync never sends "CM".
 *
 * @param {Array<{ method_code?: string, amount?: number, adjustment_type?: string, reference_number?: string|null }>} rows
 * @param {object|null|undefined} [sourceSale]
 * @param {Array<{ method_code?: string }>} [catalog]
 */
export function normalizePaymentAdjustmentMethodCodes(rows, sourceSale = null, catalog = []) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  const prior = priorSaleTenderMap(sourceSale);

  for (const row of list) {
    if (!row || !(Number(row.amount) > 0)) continue;
    const codes = expandPosPaymentMethodCodes(row.method_code, catalog);
    if (codes.length <= 1) {
      out.push({
        ...row,
        method_code: codes[0] || String(row.method_code ?? "CASH").trim().toUpperCase() || "CASH",
        amount: Math.round(Number(row.amount) * 100) / 100,
      });
      continue;
    }
    const weights = codes.map((code) => {
      const bucket = previousOrderEditTenderBucket(code);
      return Number(prior[bucket] ?? 0) || 0;
    });
    const parts = splitAmountAcrossPaymentMethods(row.amount, codes, weights);
    for (const part of parts) {
      out.push({
        ...row,
        method_code: part.method_code,
        amount: part.amount,
      });
    }
  }
  return out;
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
 * Rebuild Cash/M-Pesa/Equity/KCB for a previous-order edit receipt:
 * - Keep original create-order tenders as-is
 * - Add top-up onto the method the cashier entered (same method combines; different shows both)
 * - Do not deduct a return from an unrelated method (cash return must not reduce M-Pesa)
 * - Return amount prints as Change Given via returnGiven
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
  const priorPaid =
    Math.round(Math.max(0, Number(sourceSale?.amount_paid) || 0) * 100) / 100;
  const priorWasCredit = Boolean(
    sourceSale?.is_credit_sale ||
      String(sourceSale?.payment_method_code ?? "")
        .trim()
        .toUpperCase() === "CREDIT" ||
      ["unpaid", "partial"].includes(
        String(sourceSale?.payment_status ?? "")
          .trim()
          .toLowerCase(),
      ),
  );

  let cash = hasSourcePayments ? prior.cash : 0;
  let mpesa = hasSourcePayments ? prior.mpesa : 0;
  let equity = hasSourcePayments ? prior.equity : 0;
  let kcb = hasSourcePayments ? prior.kcb : 0;

  // Top-up: add onto the cashier-chosen method (combine when same as original).
  for (const row of rows) {
    if (row.adjustment_type !== "topup") continue;
    const amt = Math.round((Number(row.amount) || 0) * 100) / 100;
    if (!(amt > 0)) continue;
    const bucket = previousOrderEditTenderBucket(row.method_code);
    if (bucket === "mpesa") mpesa = Math.round((mpesa + amt) * 100) / 100;
    else if (bucket === "equity") equity = Math.round((equity + amt) * 100) / 100;
    else if (bucket === "kcb") kcb = Math.round((kcb + amt) * 100) / 100;
    else cash = Math.round((cash + amt) * 100) / 100;
  }

  // Returns: never waterfall-deduct across methods (that moved a Cash refund onto M-Pesa).
  // Keep original (+ top-up) tender lines on the receipt; Change Given carries the refund.

  // Credit unpaid/partial with no new top-up/return: keep the prior settlement.
  const preserveCreditSettlement =
    priorWasCredit && topupAmount <= 0.0001 && returnGiven <= 0.0001;

  if (!hasSourcePayments && topupAmount <= 0 && returnGiven <= 0) {
    const amountPaid = priorWasCredit ? Math.min(priorPaid, target) : target;
    return {
      cash: 0,
      mpesa: 0,
      equity: 0,
      kcb: 0,
      returnGiven,
      topupAmount,
      amountPaid,
      adjustments: rows,
    };
  }

  if (preserveCreditSettlement) {
    const normalizeTarget = Math.min(
      priorPaid > 0.009 ? priorPaid : hasSourcePayments ? priorTenderSum : 0,
      target,
    );
    const normalized = normalizePreviousOrderEditTenders(
      { cash, mpesa, equity, kcb },
      normalizeTarget,
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

  // Top-up only: nudge rounding drift onto the top-up method (never reclass onto prior).
  if (topupAmount > 0.0001 && returnGiven <= 0.0001) {
    const sum = Math.round((cash + mpesa + equity + kcb) * 100) / 100;
    const drift = Math.round((target - sum) * 100) / 100;
    if (Math.abs(drift) >= 0.01) {
      const topupRow = rows.find((row) => row.adjustment_type === "topup");
      const bucket = previousOrderEditTenderBucket(topupRow?.method_code ?? fallbackMethod);
      if (bucket === "mpesa") mpesa = Math.max(0, Math.round((mpesa + drift) * 100) / 100);
      else if (bucket === "equity") equity = Math.max(0, Math.round((equity + drift) * 100) / 100);
      else if (bucket === "kcb") kcb = Math.max(0, Math.round((kcb + drift) * 100) / 100);
      else cash = Math.max(0, Math.round((cash + drift) * 100) / 100);
    }
  } else if (topupAmount <= 0.0001 && returnGiven <= 0.0001) {
    // No adjustment rows after reconcile — keep mix clamped to revised total.
    const normalized = normalizePreviousOrderEditTenders(
      { cash, mpesa, equity, kcb },
      target,
    );
    cash = normalized.cash;
    mpesa = normalized.mpesa;
    equity = normalized.equity;
    kcb = normalized.kcb;
  }

  const displayPaid =
    Math.round((cash + mpesa + equity + kcb) * 100) / 100;
  // Settlement amount is the revised bill; display tenders may exceed it when a
  // return is refunded via a different method (Change Given covers the difference).
  const amountPaid = returnGiven > 0.0001 ? target : displayPaid;

  return {
    cash,
    mpesa,
    equity,
    kcb,
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
 * True when payment_adjustments were only stashed for background autosave and
 * the cashier has not yet confirmed method via Payment Breakdown (Alt+P / F8).
 * @param {Array<{ provisional?: boolean, _provisional?: boolean }>|null|undefined} adjustments
 */
export function previousOrderAdjustmentsAreProvisional(adjustments) {
  if (!Array.isArray(adjustments) || adjustments.length === 0) return false;
  return adjustments.some(
    (row) => Boolean(row?.provisional ?? row?._provisional),
  );
}

/**
 * @param {Array<{ adjustment_type?: string, amount?: number, provisional?: boolean, _provisional?: boolean }>|null|undefined} adjustments
 * @param {{ amount: number, type: string|null }} delta
 */
export function previousOrderAdjustmentsMatchDelta(adjustments, delta) {
  if (!delta?.type || !(Number(delta.amount) > 0)) return true;
  if (!Array.isArray(adjustments) || adjustments.length === 0) return false;
  // Autosave provisional cash rows must not satisfy Alt+P / F8 — cashier still
  // needs the Payment Breakdown popup to pick top-up / return method.
  if (previousOrderAdjustmentsAreProvisional(adjustments)) return false;
  const total = adjustments.reduce(
    (sum, row) =>
      row?.adjustment_type === delta.type ? sum + (Number(row.amount) || 0) : sum,
    0,
  );
  return Math.abs(total - Number(delta.amount)) < 0.02;
}
