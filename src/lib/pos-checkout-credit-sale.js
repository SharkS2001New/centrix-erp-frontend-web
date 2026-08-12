export const POS_CREDIT_CUSTOMER_REQUIRED_MESSAGE =
  "Credit sales require a registered customer.";

export const POS_FULL_PAYMENT_REQUIRED_MESSAGE =
  "Full payment required for Cash, M-Pesa, bank, and cheque. Select a credit customer (I) to save as fully unpaid.";

/**
 * External POS direct checkout: full tender or credit (I) only — no partial A/R at till.
 * @returns {string|null} error message, or null when valid
 */
export function validatePosDirectCheckoutPayment({
  isCreditSale = false,
  payNow = 0,
  amountDue = 0,
  customerNum = null,
} = {}) {
  if (isCreditSale) {
    const num = Number(customerNum);
    if (!(num > 0)) return POS_CREDIT_CUSTOMER_REQUIRED_MESSAGE;
    return null;
  }
  const due = Math.max(0, Number(amountDue) || 0);
  const paid = Math.max(0, Number(payNow) || 0);
  if (due > 0.01 && paid + 0.01 < due) {
    return POS_FULL_PAYMENT_REQUIRED_MESSAGE;
  }
  return null;
}

/**
 * Credit / invoice (I) only when a credit customer is selected AND the bill is not
 * fully covered. Pressing C/M/E/K and paying in full must never book A/R — even if
 * the cashier briefly opened invoice mode first.
 */
export function isCheckoutCreditSale({
  hasCreditCustomer,
  amountPaid,
  checkoutTotal,
  adjustmentMode = false,
}) {
  if (adjustmentMode || !hasCreditCustomer) return false;
  const total = Math.max(0, Number(checkoutTotal) || 0);
  const paid = Math.max(0, Number(amountPaid) || 0);
  if (total <= 0.01) return false;
  return paid + 0.01 < total;
}
