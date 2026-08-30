/**
 * Organization payment methods for pickers and payment posting.
 *
 * Source of truth for which tenders appear: Settings → Sales → Recording payments
 * (M-Pesa / Equity / KCB / Other bank / Cheque field toggles).
 *
 * Catalog rows still come from Administration → Payment methods (`is_active`).
 * Use {@link filterPaymentMethodsForOrg} (or {@link listExpensePaymentMethods} for expenses).
 *
 * {@link listActiveOrgPaymentMethods} returns the full active catalog without Recording
 * payments filtering — prefer only when you need labels for already-posted payments.
 */

import { getPaymentMethodKind } from "@/lib/sales";
import { isPosMpesaPaymentsEnabled, isPlatformEquityBankEnabled } from "@/lib/platform-org-features";
import { getCheckoutPaymentConfig, mergeSalesSettings } from "@/lib/sales-settings";

const MPESA_CODES = new Set(["MPESA", "M-PESA", "M_PESA"]);
const CHEQUE_CODES = new Set(["CHEQUE", "CHECK"]);
const OTHER_BANK_CODES = new Set(["OTHER", "BANK", "BANK_TRANSFER", "TRANSFER"]);

const PREFERRED_ORDER = [
  "CASH",
  "MPESA",
  "EQUITY",
  "KCB",
  "OTHER",
  "BANK",
  "CHEQUE",
  "CREDIT",
];

function normalizeCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .trim();
}

function preferredRank(code) {
  const idx = PREFERRED_ORDER.indexOf(code);
  if (idx >= 0) return idx;
  if (MPESA_CODES.has(code)) return PREFERRED_ORDER.indexOf("MPESA");
  if (CHEQUE_CODES.has(code)) return PREFERRED_ORDER.indexOf("CHEQUE");
  if (OTHER_BANK_CODES.has(code)) return PREFERRED_ORDER.indexOf("OTHER");
  return PREFERRED_ORDER.length + 1;
}

function sortOrgPaymentMethods(list) {
  return list.slice().sort((a, b) => {
    const rankDiff =
      preferredRank(normalizeCode(a.method_code)) -
      preferredRank(normalizeCode(b.method_code));
    if (rankDiff !== 0) return rankDiff;
    return String(a.method_name ?? "").localeCompare(String(b.method_name ?? ""));
  });
}

/**
 * All active Administration → Payment methods rows (no Recording payments filter).
 *
 * @param {Array<object>|null|undefined} methods
 * @returns {Array<object>}
 */
export function listActiveOrgPaymentMethods(methods) {
  const list = (Array.isArray(methods) ? methods : []).filter((row) => {
    if (!row) return false;
    const active = row.is_active;
    if (active === false || active === 0 || active === "0") return false;
    return true;
  });
  return sortOrgPaymentMethods(list);
}

/**
 * Which tender slots Recording payments / External POS are configured to collect.
 *
 * @param {object|null} moduleSettings
 * @param {object} [options]
 * @param {object|null} [options.capabilities]
 * @param {"pos"|"order_payment"} [options.checkoutContext]
 * @param {boolean} [options.includeCredit]
 */
export function resolveOrgPaymentMethodFlags(moduleSettings, options = {}) {
  const capabilities = options.capabilities ?? null;
  const settings = moduleSettings ?? capabilities?.module_settings ?? {};
  const sales = mergeSalesSettings(settings);
  const payment = getCheckoutPaymentConfig(settings, {
    checkoutContext: options.checkoutContext ?? "order_payment",
    capabilities,
  });

  // When capabilities are present, respect platform M-Pesa gate (same as POS panels).
  const mpesaOn =
    Boolean(sales.enable_mpesa_amount) &&
    (capabilities == null || isPosMpesaPaymentsEnabled(capabilities));

  const equityOn =
    (capabilities == null || isPlatformEquityBankEnabled(capabilities)) &&
    (Boolean(sales.enable_equity_bank) ||
      payment.bankOptions.some((row) => row.value === "EQUITY"));
  const kcbOn =
    Boolean(sales.enable_kcb_bank) ||
    payment.bankOptions.some((row) => row.value === "KCB");
  const otherBankOn =
    Boolean(sales.enable_other_bank) ||
    payment.bankOptions.some((row) => row.value === "OTHER");

  return {
    cash: true,
    mpesa: mpesaOn,
    equity: equityOn,
    kcb: kcbOn,
    otherBank: otherBankOn,
    cheque: Boolean(sales.enable_cheque),
    credit:
      options.includeCredit === true && Boolean(payment.enableCreditPayment),
    otherBankLabel: payment.otherBankLabel || "Other bank",
  };
}

/**
 * Filter active catalog rows to Settings → Sales → Recording payments toggles.
 * Cash is always included; M-Pesa / Equity / KCB / Other bank / Cheque follow the settings.
 *
 * @param {Array<object>|null|undefined} methods
 * @param {object|null} moduleSettings
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function filterPaymentMethodsForOrg(methods, moduleSettings, options = {}) {
  const flags = resolveOrgPaymentMethodFlags(moduleSettings, options);
  const list = (Array.isArray(methods) ? methods : []).filter(
    (row) => row && row.is_active !== false,
  );

  const filtered = list.filter((row) => {
    const code = normalizeCode(row.method_code);
    const kind = getPaymentMethodKind(row);

    if (kind === "cash" || code === "CASH") return flags.cash;
    if (kind === "mpesa" || MPESA_CODES.has(code)) return flags.mpesa;
    if (kind === "cheque" || CHEQUE_CODES.has(code)) return flags.cheque;
    if (kind === "credit" || code.includes("CREDIT")) return flags.credit;

    if (code === "EQUITY") return flags.equity;
    if (code === "KCB") return flags.kcb;
    if (OTHER_BANK_CODES.has(code)) return flags.otherBank;

    // Custom / Card / Voucher / Points — not part of Recording payments fields.
    return false;
  });

  return sortOrgPaymentMethods(filtered);
}

/**
 * Payment methods for Record expense pickers.
 * Same Recording payments filter as elsewhere; Credit and Cheque are not expense tenders.
 *
 * @param {Array<object>|null|undefined} methods
 * @param {object|null} [moduleSettings]
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function listExpensePaymentMethods(methods, moduleSettings = null, options = {}) {
  const excluded = new Set(["CREDIT", "CHEQUE", "CHECK"]);
  return filterPaymentMethodsForOrg(methods, moduleSettings, {
    ...options,
    includeCredit: false,
  }).filter((row) => {
    const code = normalizeCode(row.method_code);
    if (excluded.has(code)) return false;
    if (code.includes("CREDIT")) return false;
    return true;
  });
}

/**
 * Default payment method for Record expense: Cash → M-Pesa → Equity → KCB → first allowed.
 *
 * @param {Array<object>|null|undefined} methods
 * @param {object|null} [moduleSettings]
 * @param {object} [options]
 * @returns {string} method id as string, or ""
 */
export function pickPreferredPaymentMethodId(methods, moduleSettings = null, options = {}) {
  const list = listExpensePaymentMethods(methods, moduleSettings, options);
  if (list.length === 0) return "";
  return String(list[0].id ?? "");
}
