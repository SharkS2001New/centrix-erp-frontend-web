import { parseDecimalInput } from "@/components/catalog/catalog-shared";

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function methodCodeOf(part) {
  return String(part?.method_code ?? part?.code ?? "").trim().toUpperCase();
}

/**
 * Ensure split lines sum to the checkout target (pay_now + cart M-Pesa when applicable).
 * Overpayment (change) is taken from CASH first — never proportionally scales M-Pesa/bank.
 */
export function alignPaymentSplitsToPayNow(splits, targetTotal) {
  const target = roundMoney(targetTotal);
  if (!Array.isArray(splits) || splits.length === 0 || target <= 0) {
    return splits ?? [];
  }

  const normalized = splits
    .filter((part) => part && Number(part.amount) > 0)
    .map((part) => ({
      ...part,
      amount: roundMoney(part.amount),
    }));

  if (normalized.length === 0) {
    return normalized;
  }

  const currentTotal = roundMoney(
    normalized.reduce((sum, part) => sum + Number(part.amount ?? 0), 0),
  );

  if (Math.abs(currentTotal - target) <= 0.02) {
    if (Math.abs(currentTotal - target) < 0.001) {
      return normalized;
    }
    const adjusted = normalized.map((part) => ({ ...part }));
    const last = adjusted[adjusted.length - 1];
    last.amount = roundMoney(last.amount + (target - currentTotal));
    return adjusted.filter((part) => part.amount > 0);
  }

  // Customer tendered more than due — reduce CASH by the change first.
  if (currentTotal > target) {
    let excess = roundMoney(currentTotal - target);
    const adjusted = normalized.map((part) => ({ ...part }));
    const cashIdx = adjusted.findIndex((part) => methodCodeOf(part) === "CASH");
    const reduceOrder =
      cashIdx >= 0
        ? [cashIdx, ...adjusted.map((_, i) => i).filter((i) => i !== cashIdx)]
        : adjusted.map((_, i) => i).reverse();

    for (const index of reduceOrder) {
      if (excess <= 0.001) break;
      const reduceBy = roundMoney(Math.min(adjusted[index].amount, excess));
      adjusted[index].amount = roundMoney(adjusted[index].amount - reduceBy);
      excess = roundMoney(excess - reduceBy);
    }

    return adjusted.filter((part) => part.amount > 0);
  }

  // Under-pay (partial): keep entered method amounts — do not invent a scale-up.
  return normalized;
}

/** Build per-method tender lines for checkout / sale payment APIs. */
export function buildCheckoutPaymentSplits(cfg, amounts) {
  const parts = [
    { code: "CASH", amount: parseDecimalInput(amounts.cashAmount ?? 0) },
    {
      code: "MPESA",
      amount: cfg.enableMpesaAmount ? parseDecimalInput(amounts.mpesaAmount ?? 0) : 0,
    },
    { code: "CHEQUE", amount: cfg.showCheque ? parseDecimalInput(amounts.chequeAmount ?? 0) : 0 },
  ];

  if (cfg.useBankSelect) {
    parts.push({
      code: amounts.bankType || "BANK",
      amount: parseDecimalInput(amounts.bankAmount ?? 0),
    });
  } else {
    if (cfg.showEquityBank) {
      parts.push({ code: "EQUITY", amount: parseDecimalInput(amounts.equityAmount ?? 0) });
    }
    if (cfg.showKcbBank) {
      parts.push({ code: "KCB", amount: parseDecimalInput(amounts.kcbAmount ?? 0) });
    }
    if (cfg.showOtherBank) {
      parts.push({ code: "OTHER", amount: parseDecimalInput(amounts.otherBankAmount ?? 0) });
    }
  }

  return parts
    .filter((part) => part.amount > 0)
    .map((part) => ({
      method_code: part.code,
      amount: part.amount,
      reference_number: paymentReferenceForSplit(part.code, amounts),
    }));
}

/** Snapshot of what the cashier typed — used for receipt print (includes change). */
export function buildReceiptTenderSnapshot(amounts, { changeDue = 0, amountPaid = 0 } = {}) {
  return {
    cash: roundMoney(parseDecimalInput(amounts.cashAmount ?? 0)),
    mpesa: roundMoney(parseDecimalInput(amounts.mpesaAmount ?? 0)),
    equity: roundMoney(parseDecimalInput(amounts.equityAmount ?? 0)),
    kcb: roundMoney(parseDecimalInput(amounts.kcbAmount ?? 0)),
    cheque: roundMoney(parseDecimalInput(amounts.chequeAmount ?? 0)),
    bank: roundMoney(parseDecimalInput(amounts.bankAmount ?? 0)),
    bank_type: amounts.bankType || null,
    amount_paid: roundMoney(amountPaid),
    change: roundMoney(Math.max(0, changeDue)),
  };
}

/**
 * Overlay cashier-entered tenders onto the sale for immediate receipt print.
 * Backend stores applied (post-change) cash; receipt should show what was typed + change.
 */
export function annotateSaleWithReceiptTenders(sale, receiptTenders, cashTendered) {
  if (!sale) return sale;
  const tenders = receiptTenders && typeof receiptTenders === "object" ? receiptTenders : null;
  const tendered = Number(cashTendered ?? tenders?.amount_paid ?? 0);
  const orderTotal = Number(sale.order_total ?? 0);
  const changeGiven = Math.max(
    0,
    Number(tenders?.change ?? 0),
    tendered > 0 ? tendered - orderTotal : 0,
    Number(sale.order_change ?? 0),
  );

  const next = { ...sale };

  if (tenders) {
    if (tenders.cash > 0 || Number(sale.cash ?? 0) <= 0) {
      next.cash = tenders.cash > 0 ? tenders.cash : Number(sale.cash ?? 0);
    }
    if (tenders.mpesa > 0 || Number(sale.mpesa_amount ?? 0) <= 0) {
      next.mpesa_amount = tenders.mpesa > 0 ? tenders.mpesa : Number(sale.mpesa_amount ?? 0);
    }
    if (tenders.equity > 0 || Number(sale.equity_amount ?? 0) <= 0) {
      next.equity_amount = tenders.equity > 0 ? tenders.equity : Number(sale.equity_amount ?? 0);
    }
    if (tenders.kcb > 0 || Number(sale.kcb_amount ?? 0) <= 0) {
      next.kcb_amount = tenders.kcb > 0 ? tenders.kcb : Number(sale.kcb_amount ?? 0);
    }
  }

  if (tendered > 0) {
    next._cash_tendered = tendered;
  }
  if (changeGiven > 0.0001) {
    next._change_given = changeGiven;
    next.order_change = changeGiven;
  }

  return next;
}

function paymentReferenceForSplit(code, amounts) {
  const normalized = String(code ?? "").toUpperCase();
  if (normalized === "MPESA") return amounts.mpesaCode?.trim() || null;
  if (normalized === "CHEQUE") return amounts.chequeNo?.trim() || null;
  if (["EQUITY", "KCB", "OTHER", "BANK"].includes(normalized)) {
    return amounts.bankRef?.trim() || null;
  }
  return (
    amounts.mpesaCode?.trim()
    || amounts.chequeNo?.trim()
    || amounts.bankRef?.trim()
    || null
  );
}
