/** Normalize customer invoice API rows for list/detail/export. */
export function normalizeCustomerInvoice(row) {
  if (!row) return row;

  const invoiceTotal = Number(row.invoice_total ?? row.total_amount ?? 0);
  const amountPaid = Number(row.amount_paid ?? 0);
  const balanceDue =
    row.balance_due != null && row.balance_due !== ""
      ? Number(row.balance_due)
      : Math.max(0, invoiceTotal - amountPaid);

  return {
    ...row,
    invoice_number: row.invoice_number ?? row.invoice_no ?? null,
    invoice_total: invoiceTotal,
    amount_paid: amountPaid,
    balance_due: balanceDue,
  };
}

export function formatCustomerInvoicePaymentStatus(status) {
  const labels = { 0: "Unpaid", 1: "Partial", 2: "Paid" };
  return labels[Number(status)] ?? "Unpaid";
}
