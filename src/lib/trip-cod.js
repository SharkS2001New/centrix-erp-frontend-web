/** Sum unpaid COD balances from trip orders (fallback when API cash_summary is absent). */
export function sumTripOrderCodBalances(sales = []) {
  return (sales ?? []).reduce((total, sale) => {
    if (sale?.is_credit_sale) return total;
    const orderTotal = Number(sale?.order_total) || 0;
    const amountPaid = Number(sale?.amount_paid) || 0;
    return total + Math.max(0, orderTotal - amountPaid);
  }, 0);
}

export function resolveTripExpectedCash(trip) {
  const summary = trip?.cash_summary;
  if (summary?.enabled) {
    const live = summary.expected_from_orders ?? summary.outstanding_from_orders;
    if (live != null) return Number(live);
  }

  if (trip?.expected_cash != null && Number(trip.expected_cash) > 0) {
    return Number(trip.expected_cash);
  }

  return sumTripOrderCodBalances(trip?.sales);
}

export function formatCollectedCashDefault(expectedCash, settledCollectedCash) {
  if (settledCollectedCash != null && settledCollectedCash !== "") {
    return String(settledCollectedCash);
  }
  if (expectedCash != null && Number(expectedCash) > 0) {
    return String(expectedCash);
  }
  return "";
}
