import { formatCustomerKes } from "@/components/customers/customer-form";

/** Outstanding AR from customer record (API may also validate from invoices). */
export function customerOutstandingBalance(customer) {
  return Math.max(0, Number(customer?.current_balance ?? 0));
}

/** Remaining credit headroom when a limit is configured (> 0). Null = no limit set. */
export function customerCreditAvailable(customer) {
  if (!customer) return null;
  const limit = Number(customer.credit_limit ?? 0);
  if (limit <= 0) return null;
  return Math.max(0, limit - customerOutstandingBalance(customer));
}

export function customerCreditSummary(customer) {
  if (!customer) return null;
  const limit = Number(customer.credit_limit ?? 0);
  const outstanding = customerOutstandingBalance(customer);
  const available = limit > 0 ? Math.max(0, limit - outstanding) : null;
  return { limit, outstanding, available };
}

/**
 * Validate a POS credit sale for a registered customer.
 * Walk-ins (no customer) cannot take credit.
 */
export function validateCustomerCreditSale({ customer, creditAmount }) {
  const amount = Math.max(0, Number(creditAmount) || 0);
  if (amount <= 0.009) return null;

  if (!customer?.customer_num) {
    return "Credit sales require a registered customer. Walk-in customers cannot be charged to accounts receivable.";
  }

  const limit = Number(customer.credit_limit ?? 0);
  if (limit <= 0) return null;

  const outstanding = customerOutstandingBalance(customer);
  const available = limit - outstanding;
  if (amount > available + 0.009) {
    return `Credit limit exceeded for ${customer.customer_name ?? "customer"}. Available credit is ${formatCustomerKes(Math.max(0, available))} (limit ${formatCustomerKes(limit)}, outstanding ${formatCustomerKes(outstanding)}).`;
  }

  return null;
}
