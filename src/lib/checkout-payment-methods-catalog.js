/**
 * Bridge Admin → Payment methods into retail POS / checkout tender config.
 * Sales settings still decide which built-in slots appear; inactive catalog rows
 * hide matching slots, and any other active catalog rows show as extra tenders.
 */

const CORE_CODES = new Set([
  "CASH",
  "MPESA",
  "M-PESA",
  "M_PESA",
  "EQUITY",
  "KCB",
  "OTHER",
  "BANK",
  "CHEQUE",
  "CHECK",
  "CREDIT",
]);

function normalizeCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .trim();
}

function isMpesaCode(code) {
  return code === "MPESA" || code === "M-PESA" || code === "M_PESA";
}

function isChequeCode(code) {
  return code === "CHEQUE" || code === "CHECK";
}

/**
 * @param {object} paymentConfig from getCheckoutPaymentConfig / getPosSalesConfig.payment
 * @param {Array<{ method_code?: string, method_name?: string, requires_reference?: boolean, is_active?: boolean }>|null|undefined} activePaymentMethods
 */
export function applyPaymentMethodsCatalog(paymentConfig, activePaymentMethods) {
  const base = paymentConfig && typeof paymentConfig === "object" ? { ...paymentConfig } : {};
  const rows = (Array.isArray(activePaymentMethods) ? activePaymentMethods : [])
    .filter((row) => row && row.is_active !== false)
    .map((row) => ({
      code: normalizeCode(row.method_code),
      label: String(row.method_name ?? "").trim() || normalizeCode(row.method_code),
      requiresReference: Boolean(row.requires_reference),
    }))
    .filter((row) => row.code);

  if (rows.length === 0) {
    return { ...base, extraTenders: Array.isArray(base.extraTenders) ? base.extraTenders : [] };
  }

  const byCode = new Map(rows.map((row) => [row.code, row]));
  const hasActive = (predicate) => rows.some((row) => predicate(row.code));
  const catalogHas = (predicate) =>
    (Array.isArray(activePaymentMethods) ? activePaymentMethods : []).some((row) =>
      predicate(normalizeCode(row?.method_code)),
    );

  // Only suppress a built-in tender when the org catalog explicitly defines that code as inactive.
  const inactiveDefined = (predicate) =>
    catalogHas(predicate) && !hasActive(predicate);

  if (inactiveDefined(isMpesaCode)) {
    base.enableMpesaAmount = false;
    base.enableMpesaCode = false;
  }
  if (inactiveDefined((c) => c === "EQUITY")) {
    base.showEquityBank = false;
    if (Array.isArray(base.bankOptions)) {
      base.bankOptions = base.bankOptions.filter((o) => o.value !== "EQUITY");
    }
  }
  if (inactiveDefined((c) => c === "KCB")) {
    base.showKcbBank = false;
    if (Array.isArray(base.bankOptions)) {
      base.bankOptions = base.bankOptions.filter((o) => o.value !== "KCB");
    }
  }
  if (inactiveDefined((c) => c === "OTHER" || c === "BANK")) {
    base.showOtherBank = false;
    if (Array.isArray(base.bankOptions)) {
      base.bankOptions = base.bankOptions.filter((o) => o.value !== "OTHER");
    }
  }
  if (inactiveDefined(isChequeCode)) {
    base.showCheque = false;
    base.showChequeNumber = false;
  }

  const mpesaRow = rows.find((row) => isMpesaCode(row.code));
  if (mpesaRow && base.enableMpesaAmount) {
    base.mpesaMethodCode = mpesaRow.code;
    base.mpesaMethodLabel = mpesaRow.label;
  }
  const equityRow = byCode.get("EQUITY");
  if (equityRow && base.showEquityBank) {
    base.equityMethodLabel = equityRow.label;
  }
  const kcbRow = byCode.get("KCB");
  if (kcbRow && base.showKcbBank) {
    base.kcbMethodLabel = kcbRow.label;
  }
  const otherRow = byCode.get("OTHER") || byCode.get("BANK");
  if (otherRow && base.showOtherBank) {
    base.otherBankLabel = otherRow.label;
    base.otherBankMethodCode = otherRow.code;
  }

  const extraTenders = rows
    .filter((row) => !CORE_CODES.has(row.code))
    .map((row) => ({
      code: row.code,
      label: row.label,
      requiresReference: row.requiresReference,
    }));

  base.extraTenders = extraTenders;
  base.hasBankPayments =
    Boolean(base.hasBankPayments) ||
    extraTenders.length > 0 ||
    Boolean(base.showEquityBank) ||
    Boolean(base.showKcbBank) ||
    Boolean(base.showOtherBank);

  return base;
}
