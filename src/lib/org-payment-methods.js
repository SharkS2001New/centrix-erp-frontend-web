/**
 * Org payment-method dropdowns for External POS / Collect payment should match
 * Sales → Settings → Payment fields (not the full Admin catalog).
 *
 * Expenses, supplier payments, and similar bookkeeping forms should use
 * {@link listActiveOrgPaymentMethods} instead — the full Admin catalog.
 */

import { getPaymentMethodKind } from "@/lib/sales";
import { isPlatformMpesaStkEnabled } from "@/lib/platform-org-features";
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
 * All active Admin → Payment methods rows (Cash, M-Pesa, Equity, Card, …).
 * Use for expenses, supplier payments, and other non-POS bookkeeping forms.
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
 * Default payment method for Record expense: Cash → M-Pesa → Equity → KCB → first active.
 *
 * @param {Array<object>|null|undefined} methods
 * @returns {string} method id as string, or ""
 */
export function pickPreferredPaymentMethodId(methods) {
  const list = listExpensePaymentMethods(methods);
  if (list.length === 0) return "";
  return String(list[0].id ?? "");
}

/**
 * Payment methods for Record expense pickers.
 * Prefers Cash → M-Pesa → Equity → KCB, then other active methods.
 *
 * @param {Array<object>|null|undefined} methods
 * @returns {Array<object>}
 */
export function listExpensePaymentMethods(methods) {
  return listActiveOrgPaymentMethods(methods);
}

/**
 * Which tender slots External POS / Collect payment are configured to collect.
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
    (capabilities == null || isPlatformMpesaStkEnabled(capabilities));

  const equityOn =
    Boolean(sales.enable_equity_bank) ||
    payment.bankOptions.some((row) => row.value === "EQUITY");
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
 * Filter Admin payment_methods rows down to External POS–configured tenders.
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

    // Custom / Card / Voucher / Points — not part of External POS payment fields.
    return false;
  });

  return sortOrgPaymentMethods(filtered);
}
