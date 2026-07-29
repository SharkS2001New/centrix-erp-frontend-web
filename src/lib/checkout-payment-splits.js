import { parseDecimalInput } from "@/components/catalog/catalog-shared";

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
