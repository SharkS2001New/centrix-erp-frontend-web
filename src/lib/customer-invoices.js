/** Derive AR payment status from amounts so badges never contradict Paid/Balance. */
export function deriveCustomerInvoicePaymentStatus({
  invoiceTotal = 0,
  amountPaid = 0,
  returnCreditTotal = 0,
  balanceDue = null,
} = {}) {
  const total = Number(invoiceTotal) || 0;
  const paid = Number(amountPaid) || 0;
  const credits = Number(returnCreditTotal) || 0;
  const balance =
    balanceDue != null && balanceDue !== ""
      ? Number(balanceDue)
      : Math.max(0, total - paid - credits);

  if (balance <= 0.01) return 2; // Paid / settled (cash and/or return credits)
  if (paid > 0.01 || credits > 0.01) return 1; // Partial
  return 0; // Unpaid
}

/** Normalize customer invoice API rows for list/detail/export. */
export function normalizeCustomerInvoice(row) {
  if (!row) return row;

  const invoiceTotal = Number(row.invoice_total ?? row.total_amount ?? 0);
  const amountPaid = Number(row.amount_paid ?? 0);
  const returnCreditTotal = Number(row.return_credit_total ?? 0);
  const balanceDue =
    row.balance_due != null && row.balance_due !== ""
      ? Number(row.balance_due)
      : Math.max(0, invoiceTotal - amountPaid - returnCreditTotal);

  const paymentStatus = deriveCustomerInvoicePaymentStatus({
    invoiceTotal,
    amountPaid,
    returnCreditTotal,
    balanceDue,
  });

  return {
    ...row,
    invoice_number: row.invoice_number ?? row.invoice_no ?? null,
    customer_name: row.customer_name ?? row.customer?.customer_name ?? null,
    invoice_total: invoiceTotal,
    amount_paid: amountPaid,
    return_credit_total: returnCreditTotal,
    balance_due: balanceDue,
    payment_status: paymentStatus,
  };
}

export function formatCustomerInvoicePaymentStatus(status) {
  const labels = { 0: "Unpaid", 1: "Partial", 2: "Paid" };
  return labels[Number(status)] ?? "Unpaid";
}
