import { formatSaleKes } from "@/lib/sale-currency";
import { resolvePaymentMethodByCode } from "@/lib/sales";

function roundCollectMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Amount the sale-payments API will actually accept: order_total − amount_paid.
 * Accounting `balance_due` can differ (returns / invoices) and must not over-collect.
 */
export function saleCollectableBalance(sale, fallbackBalanceDue) {
  const fromColumns = roundCollectMoney(
    Math.max(0, Number(sale?.order_total ?? 0) - Number(sale?.amount_paid ?? 0)),
  );
  if (fromColumns <= 0.01) return fromColumns;

  const fallback = Number(fallbackBalanceDue);
  if (Number.isFinite(fallback) && fallback > 0.01) {
    return roundCollectMoney(Math.min(fromColumns, fallback));
  }
  return fromColumns;
}

/**
 * Collect payment Complete/PageDown must not invent cash to close the bill.
 * Filling remaining cash turned a typed M-Pesa installment into a full settlement;
 * if the second method then failed, cash was already on the order.
 */
export function shouldPrefillRemainingCashOnComplete({
  allowPartialPayment = false,
  adjustmentMode = false,
} = {}) {
  return !adjustmentMode && !allowPartialPayment;
}

/**
 * Normalize checkout tenders for POST /sales/{id}/payments.
 * @throws {Error} when amounts are empty, over the sale remaining, or do not match pay_now.
 */
export function collectPaymentSplitsFromCheckoutBody(body, balanceDue) {
  const raw =
    Array.isArray(body?.payment_splits) && body.payment_splits.length > 0
      ? body.payment_splits
      : [
          {
            method_code: String(body?.payment_method_code ?? "CASH").toUpperCase(),
            amount: body?.pay_now,
            reference_number: body?.payment_reference || null,
          },
        ];

  const splits = raw
    .map((row) => ({
      method_code: String(row?.method_code ?? "CASH").toUpperCase().trim() || "CASH",
      amount: roundCollectMoney(Number(row?.amount ?? 0)),
      reference_number: row?.reference_number || null,
    }))
    .filter((row) => row.amount > 0.009);

  if (splits.length === 0) {
    throw new Error("Enter a payment amount greater than zero.");
  }

  const total = roundCollectMoney(splits.reduce((sum, row) => sum + row.amount, 0));
  const due = roundCollectMoney(Number(balanceDue ?? 0));
  const payNow = roundCollectMoney(Number(body?.pay_now ?? total));

  if (due <= 0.01) {
    throw new Error("This order has already been fully paid.");
  }
  if (total - due > 0.01) {
    throw new Error(
      `Payment of ${formatSaleKes(total)} exceeds the amount due of ${formatSaleKes(due)}. Enter the correct amount to continue.`,
    );
  }
  if (Math.abs(total - payNow) > 0.02) {
    throw new Error("Payment methods do not add up to the amount being collected.");
  }

  return { splits, total };
}

/** Resolve org payment_methods rows before any POST so a missing method cannot post the first split. */
export function resolveCollectPaymentMethods(splits, paymentMethods) {
  return (Array.isArray(splits) ? splits : []).map((split) => {
    const method = resolvePaymentMethodByCode(paymentMethods, split.method_code);
    if (!method) {
      throw new Error(
        `Payment method "${split.method_code}" is not set up. Enable it under Settings → Sales → Recording payments, or use an enabled method.`,
      );
    }
    return {
      ...split,
      payment_method_id: method.id,
    };
  });
}
