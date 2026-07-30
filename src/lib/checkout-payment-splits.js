import { parseDecimalInput } from "@/components/catalog/catalog-shared";

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

/** Ensure split lines sum to the checkout target (pay_now + cart M-Pesa when applicable). */
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

  if (currentTotal <= 0) {
    return normalized;
  }

  let allocated = 0;
  const scaled = normalized.map((part, index) => {
    if (index === normalized.length - 1) {
      return {
        ...part,
        amount: roundMoney(Math.max(0, target - allocated)),
      };
    }
    const share = roundMoney((part.amount / currentTotal) * target);
    allocated += share;
    return { ...part, amount: share };
  });

  return scaled.filter((part) => part.amount > 0);
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
