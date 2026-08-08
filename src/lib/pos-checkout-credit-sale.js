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
